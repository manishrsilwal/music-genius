import { describe, expect, it } from "vitest";

import {
	ALSO_LIKED_COUNT,
	CATALOGUE,
	DEEP_DIVE_COUNT,
	MOODS,
	type Preferences,
	PULLS,
	pickAlsoLiked,
	pickDeepDives,
	seedFromDate,
} from "./deep-dives";

const NONE: Preferences = { moods: [], pull: null, familiarity: null };
const seed = seedFromDate("2026-08-22");

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

	it("covers every mood × pull cell", () => {
		for (const mood of MOODS) {
			for (const pull of PULLS) {
				const cell = CATALOGUE.filter(
					(t) => t.mood === mood && t.pull === pull,
				);
				expect(cell.length, `empty cell: ${mood}/${pull}`).toBeGreaterThan(0);
			}
		}
	});

	it("is big enough to fill both shelves without repeating", () => {
		expect(CATALOGUE.length).toBeGreaterThan(
			DEEP_DIVE_COUNT + ALSO_LIKED_COUNT,
		);
	});

	it("holds a meaningful share of deep cuts", () => {
		// Familiarity is only a real choice if "deep" has somewhere to go.
		const deep = CATALOGUE.filter((t) => t.familiarity === "deep").length;
		expect(deep / CATALOGUE.length).toBeGreaterThan(0.25);
	});
});

describe("pickDeepDives", () => {
	it("returns the requested number and is deterministic per day", () => {
		expect(pickDeepDives(NONE, seed)).toHaveLength(DEEP_DIVE_COUNT);
		expect(pickDeepDives(NONE, seed)).toEqual(pickDeepDives(NONE, seed));
	});

	it("rotates between days", () => {
		const a = pickDeepDives(NONE, seedFromDate("2026-08-22"));
		const b = pickDeepDives(NONE, seedFromDate("2026-09-30"));
		expect(a.map((t) => t.title)).not.toEqual(b.map((t) => t.title));
	});

	it("honours a single mood", () => {
		for (const mood of MOODS) {
			const picks = pickDeepDives({ ...NONE, moods: [mood] }, seed);
			expect(
				picks.every((t) => t.mood === mood),
				`mood ${mood}`,
			).toBe(true);
		}
	});

	it("WIDENS rather than narrows when several moods are chosen", () => {
		// The whole reason mood is multi-select: two answers must not shrink the
		// pool the way the old language/era partitions did.
		const one = pickDeepDives({ ...NONE, moods: ["longing"] }, seed);
		const two = pickDeepDives({ ...NONE, moods: ["longing", "defiant"] }, seed);
		const moodsInTwo = new Set(two.map((t) => t.mood));
		expect(one).toHaveLength(DEEP_DIVE_COUNT);
		expect(two).toHaveLength(DEEP_DIVE_COUNT);
		expect(moodsInTwo.size).toBeGreaterThan(1);
	});

	it("mixes languages and eras rather than returning one flavour", () => {
		// Language and era are no longer asked about, so the shelf has to mix on
		// its own — this is what the diversity pass exists for.
		const picks = pickDeepDives({ ...NONE, moods: ["longing"] }, seed);
		expect(new Set(picks.map((t) => t.language)).size).toBeGreaterThan(1);
	});

	it("never repeats an artist within a shelf", () => {
		for (const mood of MOODS) {
			const picks = pickDeepDives({ ...NONE, moods: [mood] }, seed);
			expect(new Set(picks.map((t) => t.artist)).size).toBe(picks.length);
		}
	});

	it("fills the shelf for every mood × pull combination", () => {
		for (const mood of MOODS) {
			for (const pull of PULLS) {
				const picks = pickDeepDives(
					{ moods: [mood], pull, familiarity: "deep" },
					seed,
				);
				expect(picks, `${mood}/${pull}`).toHaveLength(DEEP_DIVE_COUNT);
			}
		}
	});

	it("treats 'surprise me' as no preference, not as a filter", () => {
		const surprise = pickDeepDives({ ...NONE, familiarity: "surprise" }, seed);
		expect(surprise).toHaveLength(DEEP_DIVE_COUNT);
	});

	it("skipping every step still returns picks", () => {
		expect(pickDeepDives(NONE, seed)).toHaveLength(DEEP_DIVE_COUNT);
	});
});

describe("pickAlsoLiked", () => {
	it("returns a longer shelf so discovery is not capped at three", () => {
		expect(pickAlsoLiked(NONE, seed)).toHaveLength(ALSO_LIKED_COUNT);
	});

	it("never repeats what the Deep Dives already showed", () => {
		const dives = pickDeepDives(NONE, seed);
		const also = pickAlsoLiked(NONE, seed, dives);
		const diveIds = new Set(dives.map((t) => t.lrclibId));
		expect(also.some((t) => diveIds.has(t.lrclibId))).toBe(false);
	});

	it("leans towards the reader's answers", () => {
		const picks = pickAlsoLiked({ ...NONE, moods: ["defiant"] }, seed);
		const onMood = picks.filter((t) => t.mood === "defiant").length;
		expect(onMood / picks.length).toBeGreaterThan(0.5);
	});

	it("still reaches beyond them, so it reads as a wander", () => {
		const picks = pickAlsoLiked({ ...NONE, moods: ["defiant"] }, seed);
		expect(new Set(picks.map((t) => t.mood)).size).toBeGreaterThan(1);
	});
});
