import { describe, expect, it } from "vitest";

import {
	CATALOGUE,
	DEEP_DIVE_COUNT,
	ERAS,
	LANGUAGES,
	MOODS,
	pickDeepDives,
	seedFromDate,
} from "./deep-dives";

const NONE = { mood: null, language: null, era: null };

describe("catalogue", () => {
	it("has an lrclib id for every entry", () => {
		// Every entry was verified against LRCLIB before being committed; a pick
		// that leads to a dead page is worse than one fewer pick.
		for (const track of CATALOGUE) {
			expect(track.lrclibId, `${track.title} has no id`).toMatch(/^\d+$/);
		}
	});

	it("has no duplicate tracks", () => {
		const keys = CATALOGUE.map((t) => `${t.artist}::${t.title}`.toLowerCase());
		expect(new Set(keys).size).toBe(CATALOGUE.length);
	});

	it("covers every mood / language / era cell", () => {
		// An empty cell means someone's exact answer returns nothing on-target.
		for (const mood of MOODS) {
			for (const language of LANGUAGES) {
				for (const era of ERAS) {
					const cell = CATALOGUE.filter(
						(t) => t.mood === mood && t.language === language && t.era === era,
					);
					expect(cell.length, `empty cell: ${mood}/${language}/${era}`).toBeGreaterThan(0);
				}
			}
		}
	});
});

describe("pickDeepDives", () => {
	const seed = seedFromDate("2026-08-22");

	it("returns the requested number of picks", () => {
		expect(pickDeepDives(NONE, seed)).toHaveLength(DEEP_DIVE_COUNT);
	});

	it("is deterministic for a given day", () => {
		expect(pickDeepDives(NONE, seed)).toEqual(pickDeepDives(NONE, seed));
	});

	it("rotates between days", () => {
		const a = pickDeepDives(NONE, seedFromDate("2026-08-22"));
		const b = pickDeepDives(NONE, seedFromDate("2026-09-30"));
		expect(a.map((t) => t.title)).not.toEqual(b.map((t) => t.title));
	});

	it("honours a stated mood", () => {
		for (const mood of MOODS) {
			const picks = pickDeepDives({ ...NONE, mood }, seed);
			expect(picks.every((t) => t.mood === mood), `mood ${mood}`).toBe(true);
		}
	});

	it("honours language and era together", () => {
		const picks = pickDeepDives(
			{ mood: "tender", language: "hindi", era: "modern" },
			seed,
		);
		expect(picks[0]?.mood).toBe("tender");
		expect(picks[0]?.language).toBe("hindi");
		expect(picks[0]?.era).toBe("modern");
	});

	it("still fills the shelf when a cell is thin", () => {
		// Partial credit rather than filtering: a thin cell must not produce an
		// empty page.
		for (const mood of MOODS) {
			for (const language of LANGUAGES) {
				for (const era of ERAS) {
					const picks = pickDeepDives({ mood, language, era }, seed);
					expect(picks, `${mood}/${language}/${era}`).toHaveLength(DEEP_DIVE_COUNT);
				}
			}
		}
	});

	it("weights mood above language above era", () => {
		const picks = pickDeepDives({ mood: "defiant", language: "hindi", era: "classic" }, seed);
		// Mood is what the reader actually came in saying, so it must not be
		// outvoted by the two lesser axes.
		expect(picks[0]?.mood).toBe("defiant");
	});

	it("skipping every step still returns picks", () => {
		expect(pickDeepDives(NONE, seed)).toHaveLength(DEEP_DIVE_COUNT);
	});
});
