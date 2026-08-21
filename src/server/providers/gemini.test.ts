import { describe, expect, it } from "vitest";

import type { InsightSource } from "../../lib/types";
import { containsQuote, validateQuote } from "./gemini.server";

/**
 * The quote gate is the single highest-stakes correctness property in the
 * product: a fabricated quote attributed to a real artist is worse than no
 * quote at all. These tests exist to keep that gate honest (D-021, D-030).
 */

const GUARDIAN = `[5] How we made Public Enemy's Fight the Power
Chuck D recalled the session: “If the government dictates who you are, then
you’re part of the power structure that keeps you down.” Hank Shocklee layered
the track from dozens of samples.`;

function source(title: string): InsightSource {
	return {
		title,
		url: `https://example.com/${title}`,
		kind: "article",
		thumbnail: null,
	};
}

describe("containsQuote", () => {
	it("accepts a quote that appears verbatim", () => {
		expect(
			containsQuote(
				GUARDIAN,
				"If the government dictates who you are, then you’re part of the power structure that keeps you down.",
			),
		).toBe(true);
	});

	it("accepts a genuine quote retyped with straight apostrophes", () => {
		expect(
			containsQuote(
				GUARDIAN,
				"If the government dictates who you are, then you're part of the power structure that keeps you down.",
			),
		).toBe(true);
	});

	it("accepts a genuine quote whose line wrapping was collapsed", () => {
		expect(
			containsQuote(GUARDIAN, "Hank Shocklee layered the track from dozens"),
		).toBe(true);
	});

	it("rejects an invented quote in the voice of the same person", () => {
		expect(
			containsQuote(
				GUARDIAN,
				"We wanted to make a record that shook the whole country awake.",
			),
		).toBe(false);
	});

	it("rejects a plausible paraphrase of a real quote", () => {
		expect(
			containsQuote(
				GUARDIAN,
				"If the government tells you who you are, you are part of the structure holding you down.",
			),
		).toBe(false);
	});

	it("rejects a fragment too short to be evidence of grounding", () => {
		expect(containsQuote(GUARDIAN, "the")).toBe(false);
		expect(containsQuote(GUARDIAN, "government")).toBe(false);
	});
});

describe("validateQuote", () => {
	const sources = [source("a"), source("b")];
	const excerpts = ["[0] a\nnothing useful here", GUARDIAN];

	it("keeps a grounded quote", () => {
		const result = validateQuote(
			{
				text: "Hank Shocklee layered the track from dozens of samples.",
				attribution: "The Guardian",
				sourceIndex: 1,
			},
			sources,
			excerpts,
		);
		expect(result?.sourceIndex).toBe(1);
	});

	it("discards a real quote cited against the wrong source", () => {
		expect(
			validateQuote(
				{
					text: "Hank Shocklee layered the track from dozens of samples.",
					attribution: "The Guardian",
					sourceIndex: 0,
				},
				sources,
				excerpts,
			),
		).toBeNull();
	});

	it("discards a fabricated quote that cites a real source", () => {
		expect(
			validateQuote(
				{
					text: "I wrote it in an afternoon and knew straight away.",
					attribution: "Chuck D",
					sourceIndex: 1,
				},
				sources,
				excerpts,
			),
		).toBeNull();
	});

	it("discards a quote citing a source index out of range", () => {
		expect(
			validateQuote(
				{ text: "anything at all here", attribution: "x", sourceIndex: 9 },
				sources,
				excerpts,
			),
		).toBeNull();
	});

	it("returns null when there are no sources to ground against", () => {
		expect(
			validateQuote(
				{ text: "anything at all here", attribution: "x", sourceIndex: 0 },
				[],
				[],
			),
		).toBeNull();
	});
});
