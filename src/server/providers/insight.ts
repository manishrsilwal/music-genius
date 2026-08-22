/**
 * The insight generation core, shared by every model provider.
 *
 * Two providers now write the drawer (D-050), and the thing that must never
 * differ between them is the part that protects the reader: the prompt, the
 * verbatim quote gate and the verbatim lyric gate. Those live here so an
 * adapter can only choose HOW it talks to a model, never WHAT the model is
 * asked for or WHICH answers are allowed through.
 *
 * Nothing in this file reads the environment or performs I/O — it is pure, and
 * it is where the tests point.
 */

import type { Insight, InsightSource } from "../../lib/types";

/** The subset of the reader's answers the model is told about (D-047). */
export interface InsightPreferences {
	mood: string | null;
	pull: string | null;
	familiarity: string | null;
}

/** The raw, untrusted shape a model returns. Never leaves this module intact. */
export interface ModelOutput {
	synthesis?: string[];
	quote?: { text?: string; attribution?: string; sourceIndex?: number } | null;
	resonance?: { lines?: string[]; text?: string[] } | null;
}

export interface InsightRequest {
	title: string;
	artist: string;
	lyrics: string;
	sources: InsightSource[];
	excerpts: string[];
	preferences?: InsightPreferences;
}

/**
 * Structured output, for providers that enforce a schema natively. Asking for
 * a schema rather than parsing prose is what makes the drawer slots reliable
 * instead of best-effort.
 */
export const RESPONSE_SCHEMA = {
	type: "object",
	properties: {
		/**
		 * An array, not a newline-delimited string. Asked for prose, the model
		 * returns one unbroken block roughly two thirds of the time — a
		 * 1400-character wall in the drawer's marquee slot. Making paragraphs
		 * structural rather than typographic is enforced by the schema instead
		 * of hoped for in the prompt, the same reasoning as `sourceIndex`.
		 */
		synthesis: {
			type: "array",
			items: { type: "string" },
			minItems: 2,
			maxItems: 3,
			description:
				"Two or three paragraphs. Each array element is one paragraph; do not include newlines inside an element.",
		},
		quote: {
			type: "object",
			nullable: true,
			properties: {
				text: { type: "string" },
				attribution: { type: "string" },
				sourceIndex: { type: "integer" },
			},
			required: ["text", "attribution", "sourceIndex"],
		},
		/**
		 * The personal slot (D-047). Omitted entirely from the request when
		 * the reader has stated nothing, so the model is never asked to write
		 * to a person it knows nothing about.
		 */
		resonance: {
			type: "object",
			nullable: true,
			properties: {
				lines: {
					type: "array",
					items: { type: "string" },
					minItems: 1,
					maxItems: 3,
					description:
						"Lines copied EXACTLY from the lyrics above, character for character.",
				},
				text: {
					type: "array",
					items: { type: "string" },
					minItems: 2,
					maxItems: 3,
					description: "Two or three short paragraphs addressed to the reader.",
				},
			},
			required: ["lines", "text"],
		},
	},
	required: ["synthesis"],
} as const;

/**
 * The same contract as prose, for providers that only guarantee "valid JSON"
 * and cannot enforce a shape (D-050).
 *
 * Not decoration. Measured over eight runs with an identical prompt, DeepSeek
 * returned a conforming `synthesis` array 0 times without this block and 8
 * times with it — and the constraint roughly halves latency, because a model
 * given a shape stops padding. It is the schema, restated in the only channel
 * the provider offers.
 */
export const SHAPE_CONTRACT = `
Return json in EXACTLY this shape. Do not add keys that are not listed here.

{
  "synthesis": ["<paragraph>", "<paragraph>"],
  "quote": {"text": "<verbatim>", "attribution": "<who>", "sourceIndex": <integer>} | null,
  "resonance": {"lines": ["<lyric line>"], "text": ["<paragraph>", "<paragraph>"]} | null
}

- "synthesis": an array of 2 or 3 strings. Each element is ONE paragraph of
  plain prose. No newline characters inside an element, no markdown, no
  numbering, no headings.
- "quote": an object, or null. Never a string.
- "resonance": an object, or null. "lines" holds 1 to 3 strings copied exactly
  from the lyrics; "text" holds 2 or 3 strings, one paragraph each.`;

/**
 * How long the drawer's prose should run.
 *
 * A budget rather than a preference. The drawer is a column beside the lyrics,
 * not an essay, and an unbounded model will happily fill it: asked without a
 * limit it ran to 218 words where 130 reads better. This governs the copy, not
 * the latency — that turned out to be reasoning tokens, and is handled in the
 * DeepSeek adapter.
 */
const LENGTH_BUDGET = `
Keep it tight. Each synthesis paragraph is 45 to 70 words; each resonance
paragraph is 35 to 55 words. Say the thing and stop.`;

/**
 * The reader's answers, as a sentence the model can write toward. Returns null
 * when nothing was stated — in which case the personal slot is left out of the
 * prompt entirely rather than asked for and discarded (D-047).
 */
function statedTaste(preferences?: InsightPreferences): string | null {
	if (!preferences) return null;

	const wants: string[] = [];
	if (preferences.mood) wants.push(`a mood of ${preferences.mood}`);
	if (preferences.pull)
		wants.push(`writing that leads with ${preferences.pull}`);
	if (preferences.familiarity && preferences.familiarity !== "surprise") {
		wants.push(
			preferences.familiarity === "canon"
				? "songs worth rereading rather than obscurities"
				: "deep cuts rather than the obvious choices",
		);
	}

	return wants.length > 0 ? wants.join(", and ") : null;
}

/**
 * Build the prompt. `describeShape` appends the shape contract for providers
 * without native schema support; providers that have one leave it off, since
 * restating a schema the API already enforces only spends tokens.
 */
export function buildPrompt(
	args: InsightRequest,
	options: { describeShape: boolean },
): string {
	const { title, artist, lyrics, excerpts } = args;

	const grounding =
		excerpts.length > 0
			? `\n\nSOURCES — each is numbered. Use ONLY these for factual claims.\n${excerpts.join("\n\n")}`
			: "\n\nNo sources are available.";

	const taste = statedTaste(args.preferences);
	const personal = taste
		? `

THE READER told us what they are looking for: ${taste}.

Write \`resonance\` for them, in the second person. Two or three short
paragraphs. Find the place in THIS song where it does the thing they asked
for, quote the lines that do it, and say what those lines are doing. Write as
though handing the song to one person, not describing it to a room.

- \`lines\` must be copied EXACTLY from the lyrics above, character for
  character. Do not translate, tidy, retype from memory, or join two lines.
- Choose one to three lines. Fewer and better beats more.
- Do not restate their preference back at them as a label. Show the song
  meeting it.
- If this song genuinely does not do what they asked for, say so plainly and
  say what it does instead. That is more useful than a stretch.`
		: `

The reader has stated no preferences, so return null for \`resonance\`.`;

	return `You are writing editorial context for a premium lyrics reader.

SONG: "${title}" by ${artist}

LYRICS:
${lyrics}${grounding}

Write a synthesis of two or three short paragraphs explaining what this song is
about — its story, its context, what the writer was reaching for. Address the
reader as an intelligent adult. No hedging, no "this song appears to", no
restating the lyrics back at them.

Return the paragraphs as separate array elements. Each element is one paragraph
of plain prose — no newlines inside an element, no markdown, no numbering.

QUOTE RULES — these are absolute:
- Only include a quote if it appears VERBATIM in the numbered sources above.
- Set sourceIndex to the number of the source it came from.
- Never invent, paraphrase, reconstruct, or "reasonably infer" a quote.
- If no genuine quote from the artist or producer exists in the sources, return
  null for quote. Returning null is correct and expected; a fabricated quote
  attributed to a real person is the worst possible failure here.${personal}${LENGTH_BUDGET}${
		options.describeShape ? `\n${SHAPE_CONTRACT}` : ""
	}`;
}

/**
 * Turn an untrusted model response into an Insight, or null if it carries
 * nothing worth showing. Every gate in this product runs here, so no adapter
 * can ship a response that skipped one.
 */
export function toInsight(
	parsed: ModelOutput,
	args: InsightRequest,
): Insight | null {
	// A provider without schema enforcement can return a bare string here, so
	// this coerces rather than assuming — the array is the contract, but the
	// wire is not bound by it (D-050).
	const paragraphs = Array.isArray(parsed.synthesis)
		? parsed.synthesis
		: typeof parsed.synthesis === "string"
			? String(parsed.synthesis).split(/\n{2,}/)
			: [];

	// Joined here rather than carried through `Insight`: the drawer already
	// splits on blank lines, and keeping the wire shape a string leaves
	// every cached entry valid. See ARCHITECTURE.md D-029.
	const synthesis = paragraphs
		.filter((paragraph): paragraph is string => typeof paragraph === "string")
		.map((paragraph) => paragraph.trim())
		.filter(Boolean)
		.join("\n\n");
	if (!synthesis) return null;

	return {
		synthesis,
		quote: validateQuote(parsed.quote, args.sources, args.excerpts),
		resonance: validateResonance(parsed.resonance, args.lyrics),
		sources: args.sources,
		ungrounded: args.sources.length === 0,
	};
}

/**
 * Verbatim comparison, tolerant of typography but not of invention.
 *
 * Models routinely retype a genuine quote with straight apostrophes or
 * collapsed whitespace, so a byte-exact check would discard real quotes far
 * more often than fake ones. Folding quote marks, dashes, ellipses and
 * whitespace keeps the gate aimed at fabrication rather than punctuation.
 */
function fold(value: string): string {
	return value
		.replace(/[‘’‛′]/g, "'")
		.replace(/[“”‟″]/g, '"')
		.replace(/[‐-―]/g, "-")
		.replace(/…/g, "...")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

export function containsQuote(excerpt: string, text: string): boolean {
	const needle = fold(text)
		.replace(/^["']|["']$/g, "")
		.trim();
	// Tavily excerpts are truncated to 1200 characters, so a long quote can be
	// cut mid-sentence. Anything this short is not evidence of grounding.
	if (needle.length < 12) return false;
	return fold(excerpt).includes(needle);
}

/**
 * The personal slot's gate (D-047).
 *
 * Every line must appear in the lyrics this song actually has. A model that
 * paraphrases a lyric, translates it, or reconstructs it from memory produces
 * something the reader will not find when they scroll — which quietly makes
 * the whole drawer untrustworthy. One bad line discards the passage: a
 * paragraph pointing at a line that is not there is worse than no paragraph.
 */
export function validateResonance(
	resonance: ModelOutput["resonance"],
	lyrics: string,
): Insight["resonance"] {
	const lines = (resonance?.lines ?? [])
		.filter((line): line is string => typeof line === "string")
		.map((line) => line.trim())
		.filter(Boolean);
	const paragraphs = (resonance?.text ?? [])
		.filter((paragraph): paragraph is string => typeof paragraph === "string")
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);

	if (lines.length === 0 || paragraphs.length === 0) return null;

	const haystack = fold(lyrics);
	for (const line of lines) {
		// Short enough to match by accident is not evidence of anything.
		const needle = fold(line);
		if (needle.length < 8 || !haystack.includes(needle)) {
			console.warn(
				"[insight] discarded resonance: a line is not in the lyrics",
			);
			return null;
		}
	}

	return { lines, text: paragraphs.join("\n\n") };
}

/**
 * Enforce the quote rules in code rather than trusting the prompt.
 *
 * A model told not to invent quotes will still occasionally do it, so a quote
 * survives only if it names a source that actually exists. This is the last
 * line of defence against attributing invented words to a real person.
 */
export function validateQuote(
	quote: ModelOutput["quote"],
	sources: InsightSource[],
	excerpts: string[],
): Insight["quote"] {
	if (!quote?.text?.trim() || !quote.attribution?.trim()) return null;
	if (sources.length === 0) return null;

	const index = quote.sourceIndex;
	if (typeof index !== "number" || index < 0 || index >= sources.length) {
		console.warn("[insight] discarded a quote citing a non-existent source");
		return null;
	}

	// A valid index only proves the model pointed at a real source, not that it
	// read one. Without this the prompt is the sole guard against a fabricated
	// quote attributed to a real artist — the worst failure this product has.
	const excerpt = excerpts[index];
	if (!excerpt || !containsQuote(excerpt, quote.text)) {
		console.warn(
			`[insight] discarded a quote absent from its cited source [${index}]`,
		);
		return null;
	}

	return {
		text: quote.text.trim(),
		attribution: quote.attribution.trim(),
		sourceIndex: index,
	};
}
