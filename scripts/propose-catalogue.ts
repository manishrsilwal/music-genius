/**
 * Catalogue expansion, proposed for review — never applied (D-073).
 *
 *   bun run scripts/propose-catalogue.ts                 # where the gaps are
 *   bun run scripts/propose-catalogue.ts --suggest       # candidates for them
 *   bun run scripts/propose-catalogue.ts --resolve list  # ready-to-paste entries
 *
 * The picker's real constraint is catalogue size, not scoring. Fifty-six
 * tracks across 4 moods × 4 pulls × 3 familiarities is 48 cells, and a reader
 * who answers all three questions reaches a cell holding four songs (D-072).
 * No ranking technique fixes that; only more tracks do.
 *
 * What this WILL do: find thin cells, propose songs for them, resolve each to
 * a real LRCLIB entry with synced lyrics, and classify it.
 *
 * What this will NOT do: write the `note`. That is stated in the type and it
 * still holds (D-045) — the note is the editorial half of "why this", and a
 * model asked to justify a pick invents a rationale it had no part in. Every
 * emitted entry carries a TODO where the note goes, so an unreviewed paste is
 * obvious on sight rather than shipping quietly.
 */

import {
	CATALOGUE,
	type CuratedTrack,
	FAMILIARITIES,
	MOODS,
	PULLS,
} from "../src/lib/deep-dives";
import { isVariant } from "../src/lib/ranking";
import { env } from "../src/server/env";
import { getTrack, searchLyrics } from "../src/server/lyrics.server";

type Cell = { mood: string; pull: string; familiarity: string; count: number };

/** Every scoreable combination, and how many tracks currently answer it. */
function cells(): Cell[] {
	const scored = FAMILIARITIES.filter((f) => f !== "surprise");
	const out: Cell[] = [];
	for (const mood of MOODS) {
		for (const pull of PULLS) {
			for (const familiarity of scored) {
				out.push({
					mood,
					pull,
					familiarity,
					count: CATALOGUE.filter(
						(t) =>
							t.mood === mood &&
							t.pull === pull &&
							t.familiarity === familiarity,
					).length,
				});
			}
		}
	}
	return out.sort((a, b) => a.count - b.count);
}

function reportGaps(): Cell[] {
	const all = cells();
	const empty = all.filter((c) => c.count === 0);
	const thin = all.filter((c) => c.count > 0 && c.count < 3);

	console.log(`catalogue: ${CATALOGUE.length} tracks across ${all.length} cells`);
	console.log(`  empty cells: ${empty.length}`);
	console.log(`  thin cells (1–2): ${thin.length}`);
	console.log(`  healthy (3+): ${all.length - empty.length - thin.length}\n`);

	console.log("thinnest first:");
	for (const c of all.slice(0, 16)) {
		console.log(`  ${String(c.count).padStart(2)}  ${c.mood} · ${c.pull} · ${c.familiarity}`);
	}

	const byLanguage = new Map<string, number>();
	const byEra = new Map<string, number>();
	for (const t of CATALOGUE) {
		byLanguage.set(t.language, (byLanguage.get(t.language) ?? 0) + 1);
		byEra.set(t.era, (byEra.get(t.era) ?? 0) + 1);
	}
	console.log(`\nlanguage: ${[...byLanguage].map(([k, v]) => `${k} ${v}`).join(" · ")}`);
	console.log(`era:      ${[...byEra].map(([k, v]) => `${k} ${v}`).join(" · ")}`);

	return [...empty, ...thin];
}

/* -------------------------------------------------------------------------
   The model, used only where judgement is cheap to check
   ---------------------------------------------------------------------- */

async function ask(prompt: string): Promise<unknown | null> {
	if (!env.deepseekApiKey) {
		console.error("DEEPSEEK_API_KEY is not set — classification needs it.");
		return null;
	}
	try {
		const response = await fetch("https://api.deepseek.com/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.deepseekApiKey}`,
			},
			body: JSON.stringify({
				model: env.deepseekModel,
				messages: [{ role: "user", content: prompt }],
				response_format: { type: "json_object" },
				temperature: 0.4,
			}),
			signal: AbortSignal.timeout(90_000),
		});
		const payload = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const raw = payload.choices?.[0]?.message?.content;
		return raw ? JSON.parse(raw) : null;
	} catch (error) {
		console.warn("  model call failed:", error);
		return null;
	}
}

async function suggest(gaps: Cell[]): Promise<void> {
	// Every thin cell by default; `--suggest 6` to take just the worst few.
	const limit = Number(process.argv[3]) || gaps.length;
	const wanted = gaps.slice(0, limit);
	console.log(`\nasking for candidates in ${wanted.length} thin cells…\n`);

	const known = CATALOGUE.map((t) => `${t.title} — ${t.artist}`).join("; ");

	// Concurrent, in small groups. Sequential took 30–60 seconds a cell, which
	// across twenty-two thin cells is a run nobody waits for — the first
	// attempt was killed at the ten-minute mark with cells still queued.
	const POOL = 5;
	const results: Array<{ cell: Cell; songs: Array<{ title: string; artist: string }> }> = [];
	for (let i = 0; i < wanted.length; i += POOL) {
		const group = wanted.slice(i, i + POOL);
		const answers = await Promise.all(
			group.map(async (cell) => {
				const result = (await ask(
					`Suggest 6 songs whose LYRICS are worth reading closely and that fit ALL of:
- mood: ${cell.mood}
- what draws you in: ${cell.pull} (storytelling | wordplay | confession | imagery)
- familiarity: ${cell.familiarity} (canon = widely known; deep = a deeper cut)

Mix English and Hindi/Urdu. Prefer songs with published, findable lyrics.
Do NOT suggest any of these, which are already held: ${known}

Return JSON: {"songs":[{"title":"…","artist":"…"}]}`,
				)) as { songs?: Array<{ title: string; artist: string }> } | null;
				return { cell, songs: result?.songs ?? [] };
			}),
		);
		results.push(...answers);
		console.log(`  …${Math.min(i + POOL, wanted.length)}/${wanted.length} cells answered`);
	}

	console.log();
	for (const { cell, songs } of results) {
		console.log(`# ${cell.mood} · ${cell.pull} · ${cell.familiarity}  (have ${cell.count})`);
		for (const song of songs) console.log(`${song.title} — ${song.artist}`);
		console.log();
	}

	console.log("Edit the list, keep what you want, then:");
	console.log("  bun run scripts/propose-catalogue.ts --resolve <file>");
}

/* -------------------------------------------------------------------------
   Resolve and classify
   ---------------------------------------------------------------------- */

const held = new Set(
	CATALOGUE.map((t) => `${t.artist}::${t.title}`.toLowerCase()),
);
const heldIds = new Set(CATALOGUE.map((t) => t.lrclibId));

async function resolve(path: string): Promise<void> {
	const file = await Bun.file(path).text();
	const lines = file
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"));

	const entries: string[] = [];
	let rejected = 0;

	for (const line of lines) {
		const [title, artist] = line.split(/\s+—\s+|\s+-\s+/).map((p) => p.trim());
		if (!title || !artist) {
			console.log(`SKIP    unparsable: ${line}`);
			rejected++;
			continue;
		}
		if (held.has(`${artist}::${title}`.toLowerCase())) {
			console.log(`SKIP    already held: ${title} — ${artist}`);
			rejected++;
			continue;
		}

		// The product's own search, ranking included — if it cannot find the
		// song, neither can a reader, and the entry would be a dead card.
		const results = await searchLyrics(`${title} ${artist}`, 5);
		const best = results.find(
			(r) => r.hasSyncedLyrics && !isVariant(r.title) && !heldIds.has(r.id),
		);
		if (!best) {
			console.log(`REJECT  no clean synced entry: ${title} — ${artist}`);
			rejected++;
			continue;
		}

		const track = await getTrack(best.id).catch(() => null);
		if (!track || track.stanzas.length < 2) {
			console.log(`REJECT  lyrics too thin: ${title} — ${artist}`);
			rejected++;
			continue;
		}

		const lyrics = track.stanzas
			.flatMap((s) => s.lines.map((l) => l.text))
			.join("\n")
			.slice(0, 2500);

		const tags = (await ask(
			`Classify this song's LYRICS. Answer only from the given options.

mood: longing | defiant | tender | restless
pull: storytelling | wordplay | confession | imagery
familiarity: canon | deep     (canon = widely known; deep = a deeper cut)
language: english | hindi
era: classic | modern         (classic = before ~1990)

Title: ${track.title}
Artist: ${track.artist}

${lyrics}

Return JSON: {"mood":"…","pull":"…","familiarity":"…","language":"…","era":"…","confidence":"high|medium|low"}`,
		)) as (Partial<CuratedTrack> & { confidence?: string }) | null;

		if (!tags?.mood) {
			console.log(`REJECT  could not classify: ${title} — ${artist}`);
			rejected++;
			continue;
		}

		/*
		 * Where it actually landed, against where it was asked for.
		 *
		 * The suggester guesses from a title and an artist; the classifier
		 * reads the words. They disagree often and the classifier is right —
		 * "Fast Car" was proposed for tender · wordplay and came back longing ·
		 * storytelling, which is what the song is. So the cell a track fills is
		 * an OUTCOME, not an instruction, and filling a specific gap takes more
		 * candidates than gaps.
		 */
		const landed = cells().find(
			(c) =>
				c.mood === tags.mood &&
				c.pull === tags.pull &&
				c.familiarity === tags.familiarity,
		);
		const fills = landed && landed.count < 3 ? "FILLS A GAP" : "already healthy";
		console.log(
			`OK      ${track.title} — ${track.artist}  (${tags.confidence ?? "?"})` +
				`\n        -> ${tags.mood} · ${tags.pull} · ${tags.familiarity}` +
				`  [${fills}, cell has ${landed?.count ?? 0}]`,
		);

		// LRCLIB is user-contributed and its casing shows it: "EMINEM", "the
		// Mountain Goats", "channa mereya". The catalogue is editorial and
		// every existing entry is properly cased, so anything shouting or
		// whispering gets flagged rather than quietly pasted.
		const odd = [track.title, track.artist].filter(
			(value) => value === value.toUpperCase() || value === value.toLowerCase(),
		);
		if (odd.length > 0) {
			console.log(`        -> CHECK CASING: ${odd.join(", ")}`);
		}
		const casingNote =
			odd.length > 0
				? "\n		// CHECK: casing came from LRCLIB and may need fixing."
				: "";
		entries.push(`	{${casingNote}
		title: ${JSON.stringify(track.title)},
		artist: ${JSON.stringify(track.artist)},
		lrclibId: ${JSON.stringify(best.id)},
		// TODO: one line on what this song does. Present tense, no
		// title-dropping, no hedging. Deliberately not generated (D-045).
		note: "",
		mood: ${JSON.stringify(tags.mood)},
		pull: ${JSON.stringify(tags.pull)},
		familiarity: ${JSON.stringify(tags.familiarity)},
		language: ${JSON.stringify(tags.language)},
		era: ${JSON.stringify(tags.era)},
	},`);
	}

	console.log(`\n${entries.length} proposed · ${rejected} rejected\n`);
	if (entries.length > 0) {
		console.log("Paste into CATALOGUE in src/lib/deep-dives.ts, then write every note:\n");
		console.log(entries.join("\n"));
	}
}

/* ---------------------------------------------------------------------- */

const arg = process.argv[2];
const gaps = reportGaps();

if (arg === "--suggest") await suggest(gaps);
else if (arg === "--resolve") {
	const path = process.argv[3];
	if (!path) console.error("\n--resolve needs a file of 'Title — Artist' lines");
	else await resolve(path);
}
