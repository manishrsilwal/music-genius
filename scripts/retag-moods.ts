/**
 * Lyric-read mood retagging (D-121) — proposals, never publications.
 *
 *   bun run scripts/retag-moods.ts
 *
 * The mood vocabulary grew from four to seven, and every existing tag was a
 * curator's one-word guess made under the old, narrower vocabulary. This
 * script re-reads each catalogue entry's ACTUAL lyric text (fetched from
 * LRCLIB, the same source the reader reads) and has the model propose a
 * primary mood plus an optional secondary against the full seven — because
 * "sad" should match songs whose words are sad, not songs whose tag happened
 * to be the nearest available word in 2026's smaller list.
 *
 * Same contract as expand-catalogue.ts: the model proposes, code validates
 * (enum-checked, no self-repeating secondary), the owner blesses. Nothing
 * touches CATALOGUE without a human hand. Output is a proposal file holding
 * a review table and a machine-readable mapping.
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { CATALOGUE, type Mood } from "../src/lib/deep-dives";
import { env } from "../src/server/env";
import { lyricsFor, tagMoods } from "./mood-tagger";

if (!env.deepseekApiKey) {
	console.error("DEEPSEEK_API_KEY is not set — the tagger needs it.");
	process.exit(1);
}

interface Proposal {
	lrclibId: string;
	title: string;
	artist: string;
	current: string;
	mood: Mood | null;
	moodAlso: Mood | null;
	reason: string;
}

/* ------------------------------------------------------------------ */

const proposals: Proposal[] = [];
const CHUNK = 4;

for (let start = 0; start < CATALOGUE.length; start += CHUNK) {
	const batch = CATALOGUE.slice(start, start + CHUNK);
	const results = await Promise.all(
		batch.map(async (track): Promise<Proposal> => {
			const label = `${track.title} — ${track.artist}`;
			const base = {
				lrclibId: track.lrclibId,
				title: track.title,
				artist: track.artist,
				current: track.mood,
			};
			try {
				const lyrics = await lyricsFor(track.lrclibId);
				if (!lyrics) {
					console.log(`SKIP     ${label}  (lyrics unavailable)`);
					return { ...base, mood: null, moodAlso: null, reason: "lyrics unavailable — kept as-is" };
				}
				const tags = await tagMoods(
					track.title,
					track.artist,
					track.language,
					lyrics,
				);
				if (!tags) {
					console.log(`SKIP     ${label}  (malformed answer)`);
					return { ...base, mood: null, moodAlso: null, reason: "malformed answer — kept as-is" };
				}
				const change =
					tags.mood !== track.mood || tags.moodAlso !== (track.moodAlso ?? null);
				console.log(
					`${change ? "RETAG" : "KEEP "}    ${label}  ${track.mood} → ${tags.mood}${tags.moodAlso ? ` + ${tags.moodAlso}` : ""}`,
				);
				return { ...base, ...tags };
			} catch (error) {
				console.log(`FAIL     ${label}  (${String(error)})`);
				return { ...base, mood: null, moodAlso: null, reason: `failed: ${String(error).slice(0, 80)}` };
			}
		}),
	);
	proposals.push(...results);
}

/* ------------------------------------------------------------------ */

const changed = proposals.filter(
	(p) =>
		p.mood !== null &&
		(p.mood !== p.current ||
			p.moodAlso !==
				(CATALOGUE.find((t) => t.lrclibId === p.lrclibId)?.moodAlso ?? null)),
);
const failed = proposals.filter((p) => p.mood === null);

// Stamped to the minute, matching expand-catalogue: reruns accumulate.
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const file = `doc/proposed-retag-moods-${stamp}.md`;
mkdirSync("doc", { recursive: true });

const rows = proposals.map((p) => {
	const proposedCell =
		p.mood === null
			? "—"
			: `${p.mood}${p.moodAlso ? ` + ${p.moodAlso}` : ""}`;
	return `| ${p.title} — ${p.artist} | ${p.current} | ${proposedCell} | ${p.reason.replace(/\|/g, "/")} |`;
});

writeFileSync(
	file,
	[
		`# Proposed mood retags — ${stamp} (D-121)`,
		"",
		`${changed.length} changed of ${proposals.length} read; ${failed.length} unreadable (kept as-is).`,
		"Every proposal was derived from the ACTUAL lyric text on LRCLIB, the",
		"same text the reader reads. The model proposes; the owner blesses;",
		"nothing lands in CATALOGUE without a human hand.",
		"",
		"| Track | Current | Proposed | Model's reason (from the lyrics) |",
		"|---|---|---|---|",
		...rows,
		"",
		"## Machine-readable mapping (for applying a blessing)",
		"",
		"```json",
		JSON.stringify(
			Object.fromEntries(
				proposals
					.filter((p) => p.mood !== null)
					.map((p) => [p.lrclibId, { mood: p.mood, moodAlso: p.moodAlso }]),
			),
			null,
			"\t",
		),
		"```",
		"",
	].join("\n"),
);

console.log(
	`\n${changed.length} retags proposed, ${failed.length} unreadable → ${file}\nReview the table, then bless.`,
);
