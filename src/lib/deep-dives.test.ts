import { describe, expect, it } from "vitest";

import {
	ALSO_LIKED_COUNT,
	CATALOGUE,
	DEEP_DIVE_COUNT,
	explainPick,
	FAMILIARITIES,
	LANGUAGES,
	MOODS,
	normalisePreferences,
	orderLanguagesByLocale,
	type Preferences,
	PULLS,
	parsePreferences,
	pickAlsoLiked,
	pickDeepDives,
	preferenceSignature,
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
		// At the default count a deep-enough shelf may legitimately stay in
		// mood (D-120 grew the catalogue past twelve defiant-adjacent picks);
		// the looseness contract is that the wander CAN cross moods, pinned
		// at a depth the single mood cannot fill alone.
		const picks = pickAlsoLiked({ ...NONE, mood: "defiant" }, seed, [], 24);
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

describe("preference plumbing", () => {
	it("gives readers who answered the same the same signature", () => {
		const a: Preferences = {
			mood: "longing",
			pull: "confession",
			familiarity: "deep",
		};
		const b: Preferences = {
			mood: "longing",
			pull: "confession",
			familiarity: "deep",
		};
		expect(preferenceSignature(a)).toBe(preferenceSignature(b));
	});

	it("separates readers who answered differently", () => {
		expect(
			preferenceSignature({ mood: "longing", pull: null, familiarity: null }),
		).not.toBe(
			preferenceSignature({ mood: "defiant", pull: null, familiarity: null }),
		);
	});

	it("collapses every unanswered stepper onto one shared entry", () => {
		// The common case, and the cheapest: it must not fragment the cache.
		expect(
			preferenceSignature({ mood: null, pull: null, familiarity: null }),
		).toBe("none");
	});

	/**
	 * The signature reaches a cache key, and every miss is a Gemini call
	 * against a 20-a-day quota. An unbounded value would let a caller mint
	 * entries at will (D-047).
	 */
	it("refuses anything outside the enums", () => {
		const junk = new URLSearchParams({
			mood: "../../evil",
			pull: "<script>",
			familiarity: "zzz",
		});
		expect(parsePreferences(junk)).toEqual({
			mood: null,
			pull: null,
			familiarity: null,
			languages: null,
		});
		expect(preferenceSignature(parsePreferences(junk))).toBe("none");
	});

	it("accepts every legitimate value", () => {
		for (const mood of MOODS) {
			for (const pull of PULLS) {
				for (const familiarity of FAMILIARITIES) {
					const params = new URLSearchParams({ mood, pull, familiarity });
					expect(parsePreferences(params)).toEqual({
						mood,
						pull,
						familiarity,
						languages: null,
					});
				}
			}
		}
	});

	it("normalises an untrusted object the same way", () => {
		expect(
			normalisePreferences({ mood: "longing", pull: 42, familiarity: {} }),
		).toEqual({
			mood: "longing",
			pull: null,
			familiarity: null,
			languages: null,
		});
		expect(normalisePreferences(undefined)).toEqual({
			mood: null,
			pull: null,
			familiarity: null,
			languages: null,
		});
	});
});

/*
 * Exploration (D-072). The catalogue holds fifty-six tracks and the shelf shows
 * three; before this the same three came back all day for every reader who
 * answered the same way — or skipped.
 */
describe("rotation", () => {
	const rotate = (n: number) => seedFromDate("2026-08-22") + n * 7919;

	it("shows a different shelf on a later visit", () => {
		const first = pickDeepDives(NONE, rotate(1));
		const second = pickDeepDives(NONE, rotate(2));
		expect(first.map((t) => t.lrclibId)).not.toEqual(
			second.map((t) => t.lrclibId),
		);
	});

	it("reaches most of the catalogue over a handful of visits", () => {
		const reached = new Set<string>();
		for (let visit = 1; visit <= 12; visit++) {
			for (const track of pickDeepDives(NONE, rotate(visit))) {
				reached.add(track.lrclibId);
			}
		}
		// Twelve visits, three at a time: thirty-six slots. Overlap is expected
		// and fine — what matters is that it is not the same three forever.
		expect(reached.size).toBeGreaterThan(20);
	});

	it("still leads with the reader's answers rather than the rotation", () => {
		// Variety must not cost relevance: whatever the visit, a stated mood
		// still decides most of the shelf.
		for (let visit = 1; visit <= 6; visit++) {
			const picks = pickDeepDives({ ...NONE, mood: "longing" }, rotate(visit));
			const matching = picks.filter((t) => t.mood === "longing").length;
			expect(matching).toBeGreaterThanOrEqual(2);
		}
	});
});

describe("already read", () => {
	it("pushes an opened track off the shelf", () => {
		const seed = seedFromDate("2026-08-22");
		const first = pickDeepDives(NONE, seed);
		const ids = first.map((t) => t.lrclibId);

		const after = pickDeepDives(NONE, seed, undefined, ids);
		expect(after.map((t) => t.lrclibId)).not.toEqual(ids);
		for (const id of after.map((t) => t.lrclibId)) {
			expect(ids).not.toContain(id);
		}
	});

	it("still returns a full shelf when everything has been read", () => {
		// A finite catalogue plus a determined reader must not produce an empty
		// page, which is why this is a penalty and not a filter.
		const everything = CATALOGUE.map((t) => t.lrclibId);
		const picks = pickDeepDives(NONE, seed, undefined, everything);
		expect(picks).toHaveLength(DEEP_DIVE_COUNT);
	});

	it("keeps read tracks out of the second shelf too", () => {
		const dives = pickDeepDives(NONE, seed);
		const read = dives.map((t) => t.lrclibId);
		const also = pickAlsoLiked(NONE, seed, [], undefined, read);
		for (const id of read) {
			expect(also.map((t) => t.lrclibId)).not.toContain(id);
		}
	});
});

/**
 * Language is a hard filter, not a score (D-120) — a wrong-language pick is
 * the one recommendation the testers named as a miss, so every promise here
 * is absolute: nothing outside the chosen languages, an honest empty shelf
 * over a silent substitution, and the reader's own locale leading the list.
 */
describe("languages (D-120)", () => {
	const seed = seedFromDate("2026-08-28");

	it("recommends only within the chosen languages", () => {
		const prefs = { ...NONE, languages: ["hindi" as const] };
		for (const track of pickDeepDives(prefs, seed)) {
			expect(track.language).toBe("hindi");
		}
		for (const track of pickAlsoLiked(prefs, seed)) {
			expect(track.language).toBe("hindi");
		}
	});

	it("returns an empty shelf, not a substitution, for an unstocked language", () => {
		// Korean, since the first blessing stocked Nepali the same day this
		// test was written — may every language retire from this test.
		const prefs = { ...NONE, languages: ["korean" as const] };
		expect(pickDeepDives(prefs, seed)).toHaveLength(0);
		expect(pickAlsoLiked(prefs, seed)).toHaveLength(0);
	});

	it("treats null and empty as anything", () => {
		expect(pickDeepDives({ ...NONE, languages: null }, seed)).toHaveLength(3);
		expect(pickDeepDives({ ...NONE, languages: [] }, seed)).toHaveLength(3);
	});

	it("orders the offered languages by the device's own locales", () => {
		const ordered = orderLanguagesByLocale(["ne-NP", "hi"]);
		expect(ordered[0]?.value).toBe("nepali");
		expect(ordered[1]?.value).toBe("hindi");
		// Unmentioned languages keep the curated order behind them.
		expect(orderLanguagesByLocale([]).map((o) => o.value)).toEqual([
			...LANGUAGES,
		]);
	});

	it("parses languages off a query string, enum-checked and deduped", () => {
		const params = new URLSearchParams(
			"languages=english+nepali+english+klingon",
		);
		expect(parsePreferences(params).languages).toEqual(["english", "nepali"]);
		expect(
			parsePreferences(new URLSearchParams("languages=klingon")).languages,
		).toBeNull();
	});

	it("normalises junk arrays the same way", () => {
		expect(
			normalisePreferences({ languages: ["hindi", 7, "x", "hindi"] }).languages,
		).toEqual(["hindi"]);
		expect(normalisePreferences({ languages: "hindi" }).languages).toBeNull();
	});

	it("signs languages sorted, and leaves old signatures untouched", () => {
		expect(
			preferenceSignature({ ...NONE, languages: ["nepali", "english"] }),
		).toBe("-.-.-.english+nepali");
		expect(
			preferenceSignature({ mood: "longing", pull: null, familiarity: null }),
		).toBe("longing.-.-");
	});
});
