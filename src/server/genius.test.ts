import { describe, expect, it } from "vitest";

import {
	canonical,
	MATCH_THRESHOLD,
	scoreNames,
	similarity,
} from "./genius.server";

/**
 * The match threshold decides whether a track gets artwork, a palette, and a
 * playback source — or none of them. A wrong hero image is worse than no hero
 * image (D-013), so these pin both sides of the cutoff.
 */
describe("canonical", () => {
	it("drops parenthetical qualifiers", () => {
		expect(canonical("Bohemian Rhapsody (Remastered 2011)")).toBe(
			"bohemian rhapsody",
		);
	});

	it("drops a featured-artist tail", () => {
		expect(canonical("Levitating (feat. DaBaby)")).toBe("levitating");
		expect(canonical("Song ft. Someone")).toBe("song");
	});

	it("folds diacritics and punctuation", () => {
		expect(canonical("Café — Déjà Vu!")).toBe("cafe deja vu");
	});
});

describe("similarity", () => {
	it("is 1 for identical strings", () => {
		expect(similarity("queen", "queen")).toBe(1);
	});

	it("is 0 for strings too short to form bigrams", () => {
		expect(similarity("a", "b")).toBe(0);
	});

	it("is symmetric", () => {
		expect(similarity("radiohead", "radiohed")).toBeCloseTo(
			similarity("radiohed", "radiohead"),
			10,
		);
	});
});

describe("scoreNames", () => {
	const accepts = (score: number) => score >= MATCH_THRESHOLD;

	it("accepts exact matches", () => {
		expect(
			accepts(scoreNames("Creep", "Radiohead", "Creep", "Radiohead")),
		).toBe(true);
	});

	it("accepts remaster and featured-artist variants", () => {
		expect(
			accepts(
				scoreNames(
					"Bohemian Rhapsody (Remastered 2011)",
					"Queen",
					"Bohemian Rhapsody",
					"Queen",
				),
			),
		).toBe(true);
		expect(
			accepts(
				scoreNames(
					"Levitating (feat. DaBaby)",
					"Dua Lipa",
					"Levitating",
					"Dua Lipa",
				),
			),
		).toBe(true);
	});

	it("tolerates a drifting 'The' prefix on the artist", () => {
		expect(
			accepts(
				scoreNames(
					"Blinding Lights",
					"The Weeknd",
					"Blinding Lights",
					"Weeknd",
				),
			),
		).toBe(true);
	});

	it("rejects an entirely different song", () => {
		expect(
			accepts(
				scoreNames("Sicko Mode", "Travis Scott", "Bohemian Rhapsody", "Queen"),
			),
		).toBe(false);
	});

	it("rejects a different song of similar length", () => {
		expect(
			accepts(scoreNames("Yesterday", "The Beatles", "Yellow", "Coldplay")),
		).toBe(false);
	});

	it("rejects a Genius translation entry for the right song", () => {
		// A real hit for "bohemian rhapsody": the lyrics are a translation and
		// the artist is Genius itself, not Queen.
		expect(
			accepts(
				scoreNames(
					"Queen - Bohemian Rhapsody (Türkçe Çeviri)",
					"Genius Türkçe Çeviriler",
					"Bohemian Rhapsody",
					"Queen",
				),
			),
		).toBe(false);
	});

	it("weights the title above the artist", () => {
		// Artist strings vary far more between catalogues than titles do.
		const titleRight = scoreNames("Creep", "Nirvana", "Creep", "Radiohead");
		const artistRight = scoreNames(
			"Lithium",
			"Radiohead",
			"Creep",
			"Radiohead",
		);
		expect(titleRight).toBeGreaterThan(artistRight);
	});

	it("leaves a wide gap between accepted and rejected", () => {
		// The cutoff should not be balanced on an edge.
		const good = scoreNames(
			"Karma Police",
			"Radiohead",
			"Karma Police",
			"Radiohead",
		);
		const bad = scoreNames(
			"Sicko Mode",
			"Travis Scott",
			"Karma Police",
			"Radiohead",
		);
		expect(good - bad).toBeGreaterThan(0.5);
	});
});
