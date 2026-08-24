import { describe, expect, it } from "vitest";

import { isDurationOutlier, isVariant, rankTracks } from "./ranking";
import type { TrackSummary } from "./types";

/*
 * Every string below is a real LRCLIB record, taken from the probe that
 * produced OD-028.
 */

const track = (
	title: string,
	artist: string,
	duration: number | null = 240,
	hasSyncedLyrics = true,
): TrackSummary => ({
	id: `${title}::${artist}`,
	title,
	artist,
	album: null,
	duration,
	hasSyncedLyrics,
	instrumental: false,
});

describe("isVariant", () => {
	it("recognises a different recording", () => {
		expect(isVariant("Lag Ja Gale (LoFi)")).toBe(true);
		expect(isVariant("The Local Train: Choo Lo (Home Demo)")).toBe(true);
		expect(isVariant("Wonderful Tonight [Official Live]")).toBe(true);
		expect(isVariant("Chura Liya Hai Tumne - Trap Mix")).toBe(true);
		expect(isVariant("Tum Se Hi (Reprise)")).toBe(true);
		expect(isVariant("Tum Se Hi-LoFi")).toBe(true);
		// No punctuation at all — the tag is simply stuck on the end.
		expect(isVariant("Chura Liya Hai Tumne Jo Dil Ko LoFi Flip")).toBe(true);
	});

	it("leaves songs whose NAME contains one of the words alone", () => {
		// The reason qualifier position is examined rather than the whole title:
		// these are songs, not versions of songs.
		expect(isVariant("Live and Let Die")).toBe(false);
		expect(isVariant("Cover Me")).toBe(false);
		expect(isVariant("Mixed Emotions")).toBe(false);
		expect(isVariant("Demolition Man")).toBe(false);
		// Long enough for the tail window to apply, and still not a variant.
		expect(isVariant("Everything In Its Right Place")).toBe(false);
	});

	it("ignores packaging, which is the same recording with a label", () => {
		expect(isVariant("Motion Sickness (Official Video)")).toBe(false);
		expect(isVariant("Holocene - Official Video")).toBe(false);
		expect(isVariant('Tum Se Hi (From "Jab We Met")')).toBe(false);
	});

	it("does not read a dash inside brackets as a top-level qualifier", () => {
		expect(isVariant("Come and Get Your Love (Single Edit - Audio)")).toBe(
			false,
		);
	});
});

describe("isDurationOutlier", () => {
	it("catches a junk upload", () => {
		// A "Creep" running 949s against a real 238.
		expect(isDurationOutlier(949, 240)).toBe(true);
	});

	it("does NOT reject a legitimately longer original", () => {
		// The trap this band is wide to avoid: when covers flood a search the
		// median is the covers', and a tight window would reject the original
		// for being unlike its imitations.
		expect(isDurationOutlier(371, 240)).toBe(false);
		expect(isDurationOutlier(330, 241)).toBe(false);
	});

	it("says nothing when a duration is missing", () => {
		expect(isDurationOutlier(null, 240)).toBe(false);
		expect(isDurationOutlier(240, null)).toBe(false);
	});
});

describe("rankTracks", () => {
	it("puts the canonical artist first through a flood of covers", () => {
		const results = [
			track("Lag Ja Gale", "Sanam Puri", 240),
			track("Lag Ja Gale", "Nayan Shankar", 280),
			track("Lag Ja Gale", "Sanam", 241),
			track("Lag Ja Gale", "Siddharth Slathia", 222),
			track("Lag Ja Gale", "Lata Mangeshkar", 330),
		];
		const ranked = rankTracks(results, { canonicalArtist: "Lata Mangeshkar" });
		expect(ranked[0]?.artist).toBe("Lata Mangeshkar");
	});

	it("still ranks sensibly with no canonical artist to go on", () => {
		const ranked = rankTracks([
			track("Tum Se Hi-LoFi", "Royal Raja LoFi", 318),
			track("Tum Se Hi", "Mohit Chauhan", 283),
		]);
		expect(ranked[0]?.artist).toBe("Mohit Chauhan");
	});

	it("sinks a junk duration below everything else", () => {
		const ranked = rankTracks([
			track("Creep", "Radiohead", 949),
			track("Creep", "radiohead", 238),
			track("Creep", "Radiohead Live", 250),
			track("Creep", "ncekclassic", 237),
		]);
		expect(ranked.at(-1)?.duration).toBe(949);
	});

	it("declines to judge a duration when there are too few to compare", () => {
		// Two numbers have no middle. The first version treated one of them as
		// the median and penalised the other, which ranked a 949-second junk
		// upload of "Creep" above the real one.
		const ranked = rankTracks([
			track("Creep", "Radiohead", 949),
			track("Creep", "radiohead", 238),
		]);
		expect(ranked).toHaveLength(2);
	});

	it("keeps covers in the list rather than removing them", () => {
		// Someone may have come for the Sanam recording; ranking it lower is a
		// judgement, hiding it would be a decision made on their behalf.
		const ranked = rankTracks(
			[
				track("Lag Ja Gale", "Sanam", 241),
				track("Lag Ja Gale", "Lata Mangeshkar", 330),
			],
			{ canonicalArtist: "Lata Mangeshkar" },
		);
		expect(ranked).toHaveLength(2);
		expect(ranked.map((r) => r.artist)).toContain("Sanam");
	});

	it("is stable where it has no opinion", () => {
		const a = track("Same", "One", 240);
		const b = track("Same", "Two", 240);
		expect(rankTracks([a, b]).map((r) => r.artist)).toEqual(["One", "Two"]);
	});
});
