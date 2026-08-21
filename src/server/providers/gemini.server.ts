/**
 * Gemini adapter for the insights synthesis (OD-003, PRD §4 Feature 2).
 *
 * Uses the REST API directly rather than the SDK: one fewer dependency, and it
 * stays runtime-agnostic, which D-009 requires while the deployment target is
 * undecided.
 */

import type { Insight, InsightSource } from "../../lib/types";
import { env } from "../env";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Structured output. Asking for a schema rather than parsing prose is what
 * makes the three drawer slots reliable instead of best-effort.
 */
const SCHEMA = {
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
	},
	required: ["synthesis"],
} as const;

interface GeminiResponse {
	candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	error?: { message?: string; code?: number };
}

interface ModelOutput {
	synthesis?: string[];
	quote?: { text?: string; attribution?: string; sourceIndex?: number } | null;
}

function buildPrompt(args: {
	title: string;
	artist: string;
	lyrics: string;
	excerpts: string[];
}): string {
	const { title, artist, lyrics, excerpts } = args;

	const grounding =
		excerpts.length > 0
			? `\n\nSOURCES — each is numbered. Use ONLY these for factual claims.\n${excerpts.join("\n\n")}`
			: "\n\nNo sources are available.";

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
  attributed to a real person is the worst possible failure here.`;
}

/**
 * Generate the synthesis. Returns null on any failure — the drawer treats that
 * as "unavailable" rather than surfacing an error to the reader.
 */
export async function generateInsight(args: {
	title: string;
	artist: string;
	lyrics: string;
	sources: InsightSource[];
	excerpts: string[];
}): Promise<Insight | null> {
	if (!env.geminiApiKey) return null;

	try {
		const response = await fetch(`${BASE}/${env.geminiModel}:generateContent`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": env.geminiApiKey,
			},
			body: JSON.stringify({
				contents: [{ parts: [{ text: buildPrompt(args) }] }],
				generationConfig: {
					responseMimeType: "application/json",
					responseSchema: SCHEMA,
					temperature: 0.7,
				},
			}),
			// PRD §4 budgets 3–6s for this; the drawer is progressive, so a
			// slow answer costs nothing but a longer shimmer.
			signal: AbortSignal.timeout(25_000),
		});

		const payload = (await response.json()) as GeminiResponse;

		if (!response.ok || payload.error) {
			const detail = payload.error?.message ?? `status ${response.status}`;
			console.warn(`[gemini] ${detail}`);
			if (response.status === 404) {
				console.warn(
					`[gemini] model "${env.geminiModel}" not found — set GEMINI_MODEL to a current one`,
				);
			}
			return null;
		}

		const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!raw) return null;

		const parsed = JSON.parse(raw) as ModelOutput;
		// Joined here rather than carried through `Insight`: the drawer already
		// splits on blank lines, and keeping the wire shape a string leaves
		// every cached entry valid. See ARCHITECTURE.md D-029.
		const synthesis = (parsed.synthesis ?? [])
			.map((paragraph) => paragraph.trim())
			.filter(Boolean)
			.join("\n\n");
		if (!synthesis) return null;

		return {
			synthesis,
			quote: validateQuote(parsed.quote, args.sources, args.excerpts),
			sources: args.sources,
			ungrounded: args.sources.length === 0,
		};
	} catch (error) {
		console.warn("[gemini] synthesis failed", error);
		return null;
	}
}

/**
 * Enforce the quote rules in code rather than trusting the prompt.
 *
 * A model told not to invent quotes will still occasionally do it, so a quote
 * survives only if it names a source that actually exists. This is the last
 * line of defence against attributing invented words to a real person.
 */
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
		.replace(/[\u2018\u2019\u201B\u2032]/g, "'")
		.replace(/[\u201C\u201D\u201F\u2033]/g, '"')
		.replace(/[\u2010-\u2015]/g, "-")
		.replace(/\u2026/g, "...")
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

export function validateQuote(
	quote: ModelOutput["quote"],
	sources: InsightSource[],
	excerpts: string[],
): Insight["quote"] {
	if (!quote?.text?.trim() || !quote.attribution?.trim()) return null;
	if (sources.length === 0) return null;

	const index = quote.sourceIndex;
	if (typeof index !== "number" || index < 0 || index >= sources.length) {
		console.warn("[gemini] discarded a quote citing a non-existent source");
		return null;
	}

	// A valid index only proves the model pointed at a real source, not that it
	// read one. Without this the prompt is the sole guard against a fabricated
	// quote attributed to a real artist — the worst failure this product has.
	const excerpt = excerpts[index];
	if (!excerpt || !containsQuote(excerpt, quote.text)) {
		console.warn(
			`[gemini] discarded a quote absent from its cited source [${index}]`,
		);
		return null;
	}

	return {
		text: quote.text.trim(),
		attribution: quote.attribution.trim(),
		sourceIndex: index,
	};
}
