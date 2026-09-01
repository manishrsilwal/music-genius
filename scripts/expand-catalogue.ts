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
import { lyricsFor, tagMoods } from "./mood-tagger";

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
- Prefer songs popular on streaming platforms — fan communities sync lyrics for what they stream, so a streaming-era hit is far likelier to verify than an equally great song that lives on cassettes. Use the exact title spelling the streaming release uses.
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

// Shelved entries AND anything already sitting in a proposal file awaiting
// blessing — repeated harvest runs must dig deeper, not re-propose the pile.
const known = new Set(CATALOGUE.map((track) => track.lrclibId));
try {
	const { readdirSync, readFileSync } = await import("node:fs");
	for (const name of readdirSync("doc")) {
		if (!name.startsWith("proposed-catalogue-")) continue;
		for (const match of readFileSync(`doc/${name}`, "utf8").matchAll(
			/lrclibId: "(\d+)"/g,
		)) {
			if (match[1]) known.add(match[1]);
		}
	}
} catch {
	// No doc directory yet; nothing proposed before.
}
const proposed: string[] = [];
const dropped: string[] = [];

const candidates = await propose();
console.log(`\nModel proposed ${candidates.length}; verifying each on LRCLIB…\n`);

for (const candidate of candidates) {
	const label = `${candidate.title} — ${candidate.artist}`;

	// The same enum discipline the app applies to everything untrusted.
	const moodOk = (MOODS as readonly string[]).includes(candidate.mood);
	const pullOk = (PULLS as readonly string[]).includes(candidate.pull);
	const familiarityOk =
		(FAMILIARITIES as readonly string[]).includes(candidate.familiarity) &&
		candidate.familiarity !== "surprise";
	const eraOk = candidate.era === "classic" || candidate.era === "modern";
	if (!moodOk || !pullOk || !familiarityOk || !eraOk) {
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

	// Moods come from the ACTUAL lyrics when they can (D-121): the proposer
	// names songs from memory, but the tagger reads the verified text — the
	// same text the reader will read. The proposer's guess survives only as
	// the fallback when lyrics or the tagger fail.
	let mood = candidate.mood as CuratedTrack["mood"];
	let moodAlso: CuratedTrack["moodAlso"];
	let moodSource = "proposer's guess — lyric tagging failed";
	try {
		const lyrics = await lyricsFor(match.id);
		const tags = lyrics
			? await tagMoods(match.title, match.artist, language, lyrics)
			: null;
		if (tags) {
			mood = tags.mood;
			moodAlso = tags.moodAlso ?? undefined;
			moodSource = `lyric-read: ${tags.reason}`;
		}
	} catch {
		// Fallback already set.
	}

	const entry: CuratedTrack = {
		title: match.title,
		artist: match.artist,
		lrclibId: match.id,
		note: candidate.note.slice(0, 200),
		mood,
		...(moodAlso ? { moodAlso } : {}),
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
			`\t\t// mood ${moodSource.replace(/\n/g, " ")}`,
			`\t\tmood: ${JSON.stringify(entry.mood)},`,
			...(entry.moodAlso
				? [`\t\tmoodAlso: ${JSON.stringify(entry.moodAlso)},`]
				: []),
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

// Stamped to the minute: repeated harvest runs on one day must accumulate
// files, not overwrite the morning's keepers with the afternoon's.
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const file = `doc/proposed-catalogue-${language}-${stamp}.ts.txt`;
mkdirSync("doc", { recursive: true });
writeFileSync(
	file,
	[
		`// Proposed ${language} catalogue entries — ${stamp} (D-120)`,
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
