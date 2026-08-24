import { describe, expect, it } from "vitest";

import {
	canonical,
	creditedArtists,
	MATCH_THRESHOLD,
	scoreNames,
	searchQuery,
	similarity,
	splitCandidates,
	stripTitleNoise,
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

/**
 * LRCLIB carries a lot of YouTube lyric-channel uploads, where `trackName` is
 * "Artist - Title" and `artistName` is the channel. `normaliseNames` cannot
 * help: it only strips the artist it was given, and that artist appears
 * nowhere in the title. A miss here costs the reader the artwork AND the
 * player, since the YouTube id rides along with the Genius match (D-049).
 */
describe("splitCandidates", () => {
	it("offers both readings of a channel upload", () => {
		expect(splitCandidates("Childish Gambino - Redbone", "7clouds")).toEqual([
			{ title: "Redbone", artist: "Childish Gambino" },
			{ title: "Childish Gambino", artist: "Redbone" },
		]);
	});

	it("stays out of the way when the recorded artist is one of the halves", () => {
		// normaliseNames has already handled these; retrying spends a request
		// on a question that was answered.
		expect(splitCandidates("Queen - Bohemian Rhapsody", "Queen")).toEqual([]);
		expect(splitCandidates("Bohemian Rhapsody - Queen", "queen")).toEqual([]);
	});

	it("ignores a separator inside brackets", () => {
		expect(
			splitCandidates(
				"Come and Get Your Love (Single Edit - Audio)",
				"Redbone",
			),
		).toEqual([]);
		expect(
			splitCandidates('Phir Le Aya Dil [Redux - From "Barfi!"]', "Pritam"),
		).toEqual([]);
	});

	it("splits at the first top-level separator, not one nested before it", () => {
		expect(splitCandidates("A (b - c) - Real Title", "channel")[0]).toEqual({
			title: "Real Title",
			artist: "A (b - c)",
		});
	});

	it("returns nothing when there is no separator or a half is empty", () => {
		expect(splitCandidates("Redbone", "Childish Gambino")).toEqual([]);
		expect(splitCandidates(" - Redbone", "channel")).toEqual([]);
		expect(splitCandidates("Redbone - ", "channel")).toEqual([]);
	});
});

/*
 * Every case below is a real LRCLIB record that produced no player before
 * D-070. A 30-track probe went from 17 playable to 27; these are the strings
 * that moved.
 */
describe("creditedArtists", () => {
	it("splits a film soundtrack's full billing", () => {
		expect(
			creditedArtists(
				"Alka Yagnik & Arijit Singh & A.R. Rahman & Irshad Kamil",
			),
		).toContain("Arijit Singh");
	});

	it("keeps the whole string as a reading, for a band that contains a separator", () => {
		// "Earth, Wind & Fire" must still be able to match itself.
		expect(creditedArtists("Earth, Wind & Fire")[0]).toBe("Earth, Wind & Fire");
	});

	it("returns a solo artist unchanged and alone", () => {
		expect(creditedArtists("Nirvana")).toEqual(["Nirvana"]);
	});
});

describe("searchQuery", () => {
	it("strips the release qualifier the search used to be sent verbatim", () => {
		expect(
			searchQuery("Motion Sickness (Official Video)", "Phoebe Bridgers"),
		).toBe("phoebe bridgers motion sickness");
	});

	it("searches the first credited name, not the last", () => {
		// `.at(-1)` searched for the lyricist, who sang none of it.
		const query = searchQuery(
			"Agar Tum Saath Ho",
			"Alka Yagnik & Arijit Singh & A.R. Rahman & Irshad Kamil",
		);
		expect(query).toContain("alka yagnik");
		expect(query).not.toContain("irshad");
	});

	it("drops a bracketed film credit", () => {
		expect(searchQuery('Tum Se Hi (From "Jab We Met")', "Mohit Chauhan")).toBe(
			"mohit chauhan tum se hi",
		);
	});
});

describe("stripTitleNoise", () => {
	it("removes a qualifier that follows a dash", () => {
		expect(stripTitleNoise("Holocene - Official Video", "Bon Iver")).toBe(
			"Holocene",
		);
		expect(
			stripTitleNoise("Chura Liya Hai Tumne - Trap Mix", "Asha Bhosle"),
		).toBe("Chura Liya Hai Tumne");
	});

	it("removes a bare performer credit with no separator at all", () => {
		expect(
			stripTitleNoise("Kabhi Kabhi Mere Dil Mein Solo By Mukesh", "Mukesh"),
		).toBe("Kabhi Kabhi Mere Dil Mein");
	});

	it("refuses to strip a tail that is part of the song's name", () => {
		// The whole point of the guard: this is the artist, not packaging, and
		// trimming it would search Genius for "Frank Ocean".
		expect(stripTitleNoise("Frank Ocean - Nights", "Blonded")).toBeNull();
		expect(
			stripTitleNoise("Love Will Tear Us Apart", "Joy Division"),
		).toBeNull();
	});

	it("refuses when the tail is a real subtitle", () => {
		expect(
			stripTitleNoise("Hurt - A Tribute to Johnny Cash", "Nine Inch Nails"),
		).toBeNull();
	});
});
