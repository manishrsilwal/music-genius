/**
 * AI-assisted catalogue expansion (D-120) — proposals, never publications.
 *
 *   bun run scripts/expand-catalogue.ts nepali            # a language
 *   bun run scripts/expand-catalogue.ts hindi defiant     # a specific cell
 *   bun run scripts/expand-catalogue.ts english --count 8
 *
 * The model's taste is the STARTING point, never the shipped product: every
 * candidate must survive verification in code — found on LRCLIB with synced
 * lyrics, matched by the same scoring that adjudicates artwork (so "close
 * enough" here means what it means everywhere else), not a variant cut, and
 * not already in the catalogue. Survivors are written to a proposal file for
 * the owner's blessing; nothing touches CATALOGUE without a human hand.
 *
 * Notes come out marked DRAFT: D-045's rule stands — editorial notes are
 * written, not generated — so the model's rationale is scaffolding for the
 * owner to rewrite, flagged loudly enough that shipping one unedited would
 * be a choice, not an accident.
 */

import { mkdirSync, writeFileSync } from "node:fs";

import {
	CATALOGUE,
	type CuratedTrack,
	FAMILIARITIES,
	type Language,
	LANGUAGES,
	MOODS,
	PULLS,
} from "../src/lib/deep-dives";
import { isVariant } from "../src/lib/ranking";
import { env } from "../src/server/env";
import { MATCH_THRESHOLD, scoreNames } from "../src/server/genius.server";
import { searchLyrics } from "../src/server/lyrics.server";

const [, , languageArg, ...rest] = process.argv;
const language = languageArg as Language;
if (!languageArg || !(LANGUAGES as readonly string[]).includes(languageArg)) {
	console.error(`Usage: bun run scripts/expand-catalogue.ts <${LANGUAGES.join("|")}> [mood] [--count N]`);
	process.exit(1);
}
const moodArg = rest.find((arg) => (MOODS as readonly string[]).includes(arg));
const countFlag = rest.indexOf("--count");
const count = countFlag >= 0 ? Number(rest[countFlag + 1]) || 12 : 12;

if (!env.deepseekApiKey) {
	console.error("DEEPSEEK_API_KEY is not set — the proposer needs it.");
	process.exit(1);
}

/* ------------------------------------------------------------------ */

// Where the shelves are thin, so the model is pointed at gaps, not asked to
// free-associate over the whole space.
const stock = new Map<string, number>();
for (const track of CATALOGUE) {
	const key = `${track.language}/${track.mood}`;
	stock.set(key, (stock.get(key) ?? 0) + 1);
}
console.log(`Current ${language} stock by mood:`);
for (const mood of MOODS) {
	console.log(`  ${mood.padEnd(9)} ${stock.get(`${language}/${mood}`) ?? 0}`);
}

const prompt = `You are helping stock a hand-curated catalogue of songs whose LYRICS reward close reading. Propose ${count} songs in the ${language} language${moodArg ? ` whose emotional register is "${moodArg}"` : ""}.

Rules:
- Well-known enough that lyric databases carry them; original studio recordings, no remixes or covers.
- Spread across moods ${moodArg ? `— all "${moodArg}"` : `(${MOODS.join(", ")})`} and pulls (${PULLS.join(", ")}).
- familiarity: "canon" for classics everyone knows, "deep" for worthy lesser-known cuts. Never "surprise".
- era: "classic" or "modern".
- note: ONE line on what the lyric does, present tense, no song-title-dropping, no hedging.

Answer as JSON: {"candidates": [{"title": "...", "artist": "...", "mood": "...", "pull": "...", "familiarity": "...", "era": "...", "note": "..."}]}`;

interface Candidate {
	title: string;
	artist: string;
	mood: string;
	pull: string;
	familiarity: string;
	era: string;
	note: string;
}

async function propose(): Promise<Candidate[]> {
	const response = await fetch("https://api.deepseek.com/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.deepseekApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: env.deepseekModel,
			messages: [{ role: "user", content: prompt }],
			response_format: { type: "json_object" },
			temperature: 1.1,
		}),
	});
	if (!response.ok) {
		throw new Error(`DeepSeek ${response.status}: ${await response.text()}`);
	}
	const payload = (await response.json()) as {
		choices?: { message?: { content?: string } }[];
	};
	const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as {
		candidates?: Candidate[];
	};
	return parsed.candidates ?? [];
}

/* ------------------------------------------------------------------ */

const known = new Set(CATALOGUE.map((track) => track.lrclibId));
const proposed: string[] = [];
const dropped: string[] = [];

const candidates = await propose();
console.log(`\nModel proposed ${candidates.length}; verifying each on LRCLIB…\n`);

for (const candidate of candidates) {
	const label = `${candidate.title} — ${candidate.artist}`;

	// The same enum discipline the app applies to everything untrusted.
	const mood = (MOODS as readonly string[]).includes(candidate.mood);
	const pull = (PULLS as readonly string[]).includes(candidate.pull);
	const familiarity =
		(FAMILIARITIES as readonly string[]).includes(candidate.familiarity) &&
		candidate.familiarity !== "surprise";
	const era = candidate.era === "classic" || candidate.era === "modern";
	if (!mood || !pull || !familiarity || !era) {
		dropped.push(`${label}  (malformed axes)`);
		continue;
	}

	const results = await searchLyrics(
		`${candidate.title} ${candidate.artist}`,
		8,
	);
	const match = results.find(
		(entry) =>
			entry.hasSyncedLyrics &&
			!isVariant(entry.title) &&
			scoreNames(entry.title, entry.artist, candidate.title, candidate.artist) >=
				MATCH_THRESHOLD,
	);

	if (!match) {
		dropped.push(`${label}  (no confident synced match on LRCLIB)`);
		continue;
	}
	if (known.has(match.id)) {
		dropped.push(`${label}  (already in the catalogue as ${match.id})`);
		continue;
	}
	known.add(match.id);

	const entry: CuratedTrack = {
		title: match.title,
		artist: match.artist,
		lrclibId: match.id,
		note: candidate.note.slice(0, 200),
		mood: candidate.mood as CuratedTrack["mood"],
		pull: candidate.pull as CuratedTrack["pull"],
		familiarity: candidate.familiarity as CuratedTrack["familiarity"],
		language,
		era: candidate.era as CuratedTrack["era"],
	};

	proposed.push(
		[
			"\t{",
			`\t\ttitle: ${JSON.stringify(entry.title)},`,
			`\t\tartist: ${JSON.stringify(entry.artist)},`,
			`\t\tlrclibId: ${JSON.stringify(entry.lrclibId)},`,
			`\t\t// DRAFT NOTE — model-written; rewrite before blessing (D-045).`,
			`\t\tnote: ${JSON.stringify(entry.note)},`,
			`\t\tmood: ${JSON.stringify(entry.mood)},`,
			`\t\tpull: ${JSON.stringify(entry.pull)},`,
			`\t\tfamiliarity: ${JSON.stringify(entry.familiarity)},`,
			`\t\tlanguage: ${JSON.stringify(entry.language)},`,
			`\t\tera: ${JSON.stringify(entry.era)},`,
			`\t\t// verified: lrclib ${match.id}, synced, ${match.duration ?? "?"}s — proposed as "${candidate.title}" / "${candidate.artist}"`,
			"\t},",
		].join("\n"),
	);
	console.log(`KEPT     ${label}  →  ${match.id} "${match.title}" / "${match.artist}"`);
}

for (const line of dropped) console.log(`DROPPED  ${line}`);

/* ------------------------------------------------------------------ */

const date = new Date().toISOString().slice(0, 10);
const file = `doc/proposed-catalogue-${language}-${date}.ts.txt`;
mkdirSync("doc", { recursive: true });
writeFileSync(
	file,
	[
		`// Proposed ${language} catalogue entries — ${date} (D-120)`,
		`// ${proposed.length} kept of ${candidates.length} proposed; ${dropped.length} dropped by verification.`,
		`// EVERY entry verified on LRCLIB with synced lyrics. Notes are DRAFTS:`,
		`// rewrite each before blessing (D-045 — notes are written, not generated).`,
		`// To bless: rewrite notes, paste entries into CATALOGUE, then run`,
		`//   bun run scripts/audit-catalogue.ts`,
		"",
		...proposed,
		"",
	].join("\n"),
);

console.log(
	`\n${proposed.length} kept, ${dropped.length} dropped → ${file}\nRewrite the DRAFT notes, then bless into CATALOGUE.`,
);
