import { describe, expect, it } from "vitest";

import {
	ALSO_LIKED_COUNT,
	CATALOGUE,
	DEEP_DIVE_COUNT,
	explainPick,
	FAMILIARITIES,
	MOODS,
	type Preferences,
	PULLS,
	pickAlsoLiked,
	pickDeepDives,
	seedFromDate,
} from "./deep-dives";

const NONE: Preferences = { mood: null, pull: null, familiarity: null };
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
			const picks = pickDeepDives({ ...NONE, mood }, seed);
			expect(
				picks.every((t) => t.mood === mood),
				`mood ${mood}`,
			).toBe(true);
		}
	});

	it("fills the shelf for every mood, so no answer is a dead end", () => {
		// Mood is single-select (D-032) and carries the heaviest weight, so a
		// thin cell would show as a short or repetitive shelf.
		for (const mood of MOODS) {
			expect(
				pickDeepDives({ ...NONE, mood }, seed),
				`mood ${mood}`,
			).toHaveLength(DEEP_DIVE_COUNT);
		}
	});

	it("mixes languages and eras rather than returning one flavour", () => {
		// Language and era are no longer asked about, so the shelf has to mix on
		// its own — this is what the diversity pass exists for.
		const picks = pickDeepDives({ ...NONE, mood: "longing" }, seed);
		expect(new Set(picks.map((t) => t.language)).size).toBeGreaterThan(1);
	});

	it("never repeats an artist within a shelf", () => {
		for (const mood of MOODS) {
			const picks = pickDeepDives({ ...NONE, mood }, seed);
			expect(new Set(picks.map((t) => t.artist)).size).toBe(picks.length);
		}
	});

	it("fills the shelf for every mood × pull combination", () => {
		for (const mood of MOODS) {
			for (const pull of PULLS) {
				const picks = pickDeepDives({ mood, pull, familiarity: "deep" }, seed);
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
		const picks = pickAlsoLiked({ ...NONE, mood: "defiant" }, seed);
		const onMood = picks.filter((t) => t.mood === "defiant").length;
		expect(onMood / picks.length).toBeGreaterThan(0.5);
	});

	it("still reaches beyond them, so it reads as a wander", () => {
		const picks = pickAlsoLiked({ ...NONE, mood: "defiant" }, seed);
		expect(new Set(picks.map((t) => t.mood)).size).toBeGreaterThan(1);
	});
});

describe("explainPick", () => {
	const track = CATALOGUE.find((t) => t.title === "Wish You Were Here");
	if (!track) throw new Error("fixture track missing from the catalogue");

	it("names only the axes that actually scored", () => {
		const { matched } = explainPick(track, {
			mood: "longing",
			pull: "imagery",
			familiarity: "canon",
		});
		expect(matched).toEqual(["longing", "the imagery", "the canon"]);
	});

	it("stays silent about an axis that did not match", () => {
		const { matched } = explainPick(track, {
			mood: "defiant",
			pull: "imagery",
			familiarity: null,
		});
		expect(matched).toEqual(["the imagery"]);
	});

	it("treats 'surprise me' as no reason, matching score()", () => {
		const { matched } = explainPick(track, {
			mood: null,
			pull: null,
			familiarity: "surprise",
		});
		expect(matched).toEqual([]);
	});

	it("returns no reasons when the stepper was skipped", () => {
		expect(explainPick(track, NONE).matched).toEqual([]);
	});

	/**
	 * The point of deriving the explanation from the same conditions as
	 * `score`: a reason may never be claimed for a track the scoring did not
	 * reward, and a rewarded track must always be able to say why.
	 */
	it("never claims a reason the scoring did not use", () => {
		const preferenceSets: Preferences[] = [];
		for (const mood of MOODS) {
			for (const pull of PULLS) {
				for (const familiarity of FAMILIARITIES) {
					preferenceSets.push({ mood, pull, familiarity });
				}
			}
		}

		for (const preferences of preferenceSets) {
			for (const candidate of CATALOGUE) {
				const { matched } = explainPick(candidate, preferences);
				const scored =
					(preferences.mood === candidate.mood ? 1 : 0) +
					(preferences.pull === candidate.pull ? 1 : 0) +
					(preferences.familiarity !== "surprise" &&
					preferences.familiarity === candidate.familiarity
						? 1
						: 0);
				expect(
					matched.length,
					`${candidate.title} / ${preferences.mood}·${preferences.pull}·${preferences.familiarity}`,
				).toBe(scored);
			}
		}
	});

	it("gives every track in the catalogue an editorial note", () => {
		for (const candidate of CATALOGUE) {
			expect(candidate.note.trim().length, candidate.title).toBeGreaterThan(20);
			// A note that opens with the title is restating, not explaining.
			expect(
				candidate.note.toLowerCase().startsWith(candidate.title.toLowerCase()),
				candidate.title,
			).toBe(false);
		}
	});
});
