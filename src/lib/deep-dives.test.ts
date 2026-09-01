import { describe, expect, it } from "vitest";

import {
	ALSO_LIKED_COUNT,
	CATALOGUE,
	DEEP_DIVE_COUNT,
	explainPick,
	FAMILIARITIES,
	LANGUAGES,
	MOODS,
	matchesMood,
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

	it("every offered mood can fill its shelf", () => {
		// The successor to the old per-cell coverage test, which pinned the
		// pre-D-121 grid: the lyric-read retag moved tags to where the words
		// actually are, and cells now shift as readings land. What must never
		// shift is the offer — a mood in the stepper with fewer tracks than a
		// shelf would make the mood promise an empty one on day one. Per-pull
		// behaviour is pinned by the stocked mood × pull test below.
		for (const mood of MOODS) {
			const stock = CATALOGUE.filter((t) => matchesMood(t, mood)).length;
			expect(stock, `mood ${mood} cannot fill a shelf`).toBeGreaterThanOrEqual(
				DEEP_DIVE_COUNT,
			);
		}
	});

	it("only ever carries moods from the vocabulary, on both tags", () => {
		for (const track of CATALOGUE) {
			expect(MOODS).toContain(track.mood);
			if (track.moodAlso) {
				expect(MOODS).toContain(track.moodAlso);
				// A secondary tag repeating the primary would be padding, and
				// padding is what the optional field exists to refuse.
				expect(track.moodAlso, `${track.title} repeats its mood`).not.toBe(
					track.mood,
				);
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

	it("keeps the mood promise: every pick carries the asked-for mood (D-121)", () => {
		// The promise that replaced back-filling: answer a mood and the shelf
		// holds only songs that carry it — primarily or secondarily — or runs
		// honestly short. An off-mood pick here is the "wanted sad, got
		// clever" failure this ruling exists to end.
		for (const mood of MOODS) {
			const picks = pickDeepDives({ ...NONE, mood }, seed);
			expect(
				picks.every((t) => matchesMood(t, mood)),
				`mood ${mood} shelf contains an off-mood pick`,
			).toBe(true);
		}
	});

	it("fills the shelf wherever the catalogue can honour it", () => {
		// For a stocked mood a short shelf would mean the picker is losing
		// tracks it has; for a thin mood a FULL shelf would mean it is
		// padding with tracks the reader refused. Both directions pinned.
		for (const mood of MOODS) {
			const stock = CATALOGUE.filter((t) => matchesMood(t, mood)).length;
			const picks = pickDeepDives({ ...NONE, mood }, seed);
			expect(picks, `mood ${mood} (stock ${stock})`).toHaveLength(
				Math.min(stock, DEEP_DIVE_COUNT),
			);
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

	it("fills the shelf for every stocked mood × pull combination", () => {
		// Within a mood the pull answer never starves the shelf: the top-tier
		// fallback reaches down for other pulls — but now only WITHIN the
		// mood, which is the D-121 change of jurisdiction.
		for (const mood of MOODS) {
			const stock = CATALOGUE.filter((t) => matchesMood(t, mood)).length;
			if (stock < DEEP_DIVE_COUNT) continue;
			for (const pull of PULLS) {
				const picks = pickDeepDives({ mood, pull, familiarity: "deep" }, seed);
				expect(picks, `${mood}/${pull}`).toHaveLength(DEEP_DIVE_COUNT);
				expect(
					picks.every((t) => matchesMood(t, mood)),
					`${mood}/${pull} broke the mood promise`,
				).toBe(true);
			}
		}
	});

	it("a mood beats pull and familiarity combined", () => {
		// The weight flip at the heart of D-121: at the old weights a track
		// matching pull AND familiarity (2 + 1.5) outranked one matching only
		// the mood (3), so the reader who asked for sad songs led with clever
		// un-sad ones. The shelf-level promise pins the outcome; this pins the
		// arithmetic through the loose shelf, which has no filter to hide
		// behind: with all three answered, mood-true tracks must dominate.
		const picks = pickAlsoLiked(
			{ mood: "longing", pull: "wordplay", familiarity: "canon" },
			seed,
		);
		const onMood = picks.filter((t) => matchesMood(t, "longing")).length;
		expect(onMood / picks.length).toBeGreaterThan(0.5);
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

describe("taste (D-121)", () => {
	// Three tracks by one artist, so likes have somewhere visible to pull.
	const nepathya = CATALOGUE.filter((t) => t.artist === "Nepathya").map(
		(t) => t.lrclibId,
	);
	if (nepathya.length < 3) throw new Error("taste fixture needs 3 Nepathya");

	it("never recommends a hidden track on either shelf", () => {
		const target = pickDeepDives(NONE, seed)[0];
		if (!target) throw new Error("no baseline pick");
		const taste = { hidden: [target.lrclibId] };
		const dives = pickDeepDives(NONE, seed, undefined, [], taste);
		const also = pickAlsoLiked(NONE, seed, dives, 24, [], taste);
		expect(dives.some((t) => t.lrclibId === target.lrclibId)).toBe(false);
		expect(also.some((t) => t.lrclibId === target.lrclibId)).toBe(false);
	});

	it("hiding never breaks the mood promise with a substitute", () => {
		// Removing a mood-true track must shrink the pool, not widen it: the
		// slot it held is filled by another mood-true track or not at all.
		const baseline = pickDeepDives({ ...NONE, mood: "longing" }, seed);
		const hidden = baseline.map((t) => t.lrclibId);
		const picks = pickDeepDives(
			{ ...NONE, mood: "longing" },
			seed,
			undefined,
			[],
			{
				hidden,
			},
		);
		expect(picks.every((t) => matchesMood(t, "longing"))).toBe(true);
		expect(picks.some((t) => hidden.includes(t.lrclibId))).toBe(false);
	});

	it("liking pulls similar tracks forward in the wander", () => {
		// Like two of the artist's songs; the third should move UP — shared
		// artist is the strongest thing "more like this" can mean. Rank
		// against the tasteless ordering, not a fixed window: a growing
		// catalogue kept pushing the track past whatever cutoff the test
		// froze (this broke at 90 entries), while the claim under test is
		// the movement, not the destination.
		const liked = nepathya.slice(0, 2);
		const third = nepathya[2] as string;
		const whole = CATALOGUE.length;
		const without = pickAlsoLiked(NONE, seed, [], whole, [], {});
		const withLikes = pickAlsoLiked(NONE, seed, [], whole, [], { liked });
		const rank = (picks: typeof withLikes) =>
			picks.findIndex((t) => t.lrclibId === third);
		expect(rank(withLikes)).toBeGreaterThanOrEqual(0);
		expect(rank(withLikes)).toBeLessThan(rank(without));
	});

	it("an answered mood still outranks every accumulated like", () => {
		// The affinity cap (3) sits below the mood weight (4) so a stack of
		// likes can never quietly overrule what the reader answered today.
		const liked = CATALOGUE.filter((t) => t.mood === "longing")
			.slice(0, 5)
			.map((t) => t.lrclibId);
		const picks = pickAlsoLiked(
			{ ...NONE, mood: "defiant" },
			seed,
			[],
			12,
			[],
			{
				liked,
			},
		);
		const onMood = picks.filter((t) => matchesMood(t, "defiant")).length;
		expect(onMood / picks.length).toBeGreaterThan(0.5);
	});

	it("hidden beats liked when a track is somehow both", () => {
		const id = nepathya[0] as string;
		const taste = { hidden: [id], liked: [id] };
		const dives = pickDeepDives(NONE, seed, undefined, [], taste);
		const also = pickAlsoLiked(NONE, seed, dives, 24, [], taste);
		expect(dives.some((t) => t.lrclibId === id)).toBe(false);
		expect(also.some((t) => t.lrclibId === id)).toBe(false);
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

	it("claims the mood for a secondary match too (D-121)", () => {
		// The reader asked for heartbreak and the song carries it — which tag
		// it carries it on is bookkeeping, not a reason.
		const twoMooded = {
			...track,
			mood: "longing" as const,
			moodAlso: "heartbroken" as const,
		};
		const { matched } = explainPick(twoMooded, {
			mood: "heartbroken",
			pull: null,
			familiarity: null,
		});
		expect(matched).toEqual(["heartbreak"]);
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
					(preferences.mood && matchesMood(candidate, preferences.mood)
						? 1
						: 0) +
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
		// Spanish, since the Punjabi/Korean harvest retired Korean from this
		// test (Nepali retired at the first blessing) — may every language
		// retire from it.
		const prefs = { ...NONE, languages: ["spanish" as const] };
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
		// Unmentioned languages keep the curated order behind them — and the
		// offer holds ONLY stocked languages (D-127): every offered value has
		// at least one track, and every stocked language is offered.
		const offered = orderLanguagesByLocale([]).map((o) => o.value);
		const stocked = LANGUAGES.filter((language) =>
			CATALOGUE.some((track) => track.language === language),
		);
		expect(offered).toEqual(stocked);
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
