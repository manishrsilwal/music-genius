import { describe, expect, it } from "vitest";

import { meaningfulAlbum, normaliseNames } from "./lrclib";

/**
 * LRCLIB metadata is user-contributed and frequently malformed. These cases
 * are all real shapes observed in its responses (ARCHITECTURE.md D-015).
 */
describe("normaliseNames", () => {
	it("leaves well-formed metadata alone", () => {
		expect(
			normaliseNames({ trackName: "Creep", artistName: "Radiohead" }),
		).toEqual({
			title: "Creep",
			artist: "Radiohead",
		});
	});

	it("strips an artist redundantly repeated at the end of the title", () => {
		expect(
			normaliseNames({
				trackName: "Bohemian Rhapsody - Queen",
				artistName: "Queen",
			}),
		).toEqual({ title: "Bohemian Rhapsody", artist: "Queen" });
	});

	it("strips an artist repeated at the start of the title", () => {
		expect(
			normaliseNames({
				trackName: "Queen - Bohemian Rhapsody",
				artistName: "Queen",
			}),
		).toEqual({ title: "Bohemian Rhapsody", artist: "Queen" });
	});

	it("splits the degenerate case where both fields carry the same 'A - B'", () => {
		// The actual top hit for "bohemian rhapsody" on LRCLIB.
		expect(
			normaliseNames({
				trackName: "Bohemian Rhapsody - Queen",
				artistName: "Bohemian Rhapsody - Queen",
			}),
		).toEqual({ title: "Bohemian Rhapsody", artist: "Queen" });
	});

	it("splits on the LAST separator, so hyphenated titles survive", () => {
		expect(
			normaliseNames({
				trackName: "Sun - Rise - Nujabes",
				artistName: "Sun - Rise - Nujabes",
			}),
		).toEqual({ title: "Sun - Rise", artist: "Nujabes" });
	});

	it("is case-insensitive when stripping a repeated artist", () => {
		expect(
			normaliseNames({
				trackName: "Creep - RADIOHEAD",
				artistName: "Radiohead",
			}),
		).toEqual({ title: "Creep", artist: "Radiohead" });
	});

	it("collapses runs of whitespace", () => {
		expect(
			normaliseNames({
				trackName: "  Karma   Police ",
				artistName: " Radiohead ",
			}),
		).toEqual({ title: "Karma Police", artist: "Radiohead" });
	});

	it("falls back to placeholders rather than emitting empty strings", () => {
		expect(
			normaliseNames({ trackName: null, artistName: null, name: null }),
		).toEqual({
			title: "Untitled",
			artist: "Unknown artist",
		});
	});

	it("falls back to `name` when trackName is missing", () => {
		expect(
			normaliseNames({ trackName: "", artistName: "Queen", name: "Fallback" })
				.title,
		).toBe("Fallback");
	});

	it("KNOWN LIMITATION: mis-splits a title that genuinely contains ' - '", () => {
		// Documented in D-015. The real artist is unrecoverable from an entry
		// whose two fields are identical, so this is the accepted trade-off
		// rather than a defect. Pinned so the behaviour cannot change silently.
		const result = normaliseNames({
			trackName: "Marquee Moon - Live",
			artistName: "Marquee Moon - Live",
		});
		expect(result).toEqual({ title: "Marquee Moon", artist: "Live" });
	});
});

describe("meaningfulAlbum", () => {
	it("keeps a real album name", () => {
		expect(meaningfulAlbum("Barfi!", "Phir Le Aya Dil", "Arijit Singh")).toBe(
			"Barfi!",
		);
	});

	it("drops an album that only repeats the artist", () => {
		// Rendered as-is this read "Arijit Singh · Arijit Singh".
		expect(
			meaningfulAlbum("Arijit Singh", "Phir Le Aya Dil", "Arijit Singh"),
		).toBeNull();
	});

	it("drops an album that only repeats the title", () => {
		expect(meaningfulAlbum("Creep", "Creep", "Radiohead")).toBeNull();
	});

	it("ignores case and surrounding whitespace when comparing", () => {
		expect(
			meaningfulAlbum("  arijit singh ", "Phir Le Aya Dil", "Arijit Singh"),
		).toBeNull();
	});

	it("drops an album that is just the artist and title joined", () => {
		// Rendered as-is this read "Radiohead · Radiohead - Creep".
		expect(
			meaningfulAlbum("Radiohead - Creep", "Creep", "Radiohead"),
		).toBeNull();
		expect(
			meaningfulAlbum("Creep - Radiohead", "Creep", "Radiohead"),
		).toBeNull();
		expect(
			meaningfulAlbum("Radiohead: Creep", "Creep", "Radiohead"),
		).toBeNull();
	});

	it("keeps a bracketed suffix, which names the recording", () => {
		// "(Redux)" and "(Remastered)" say which version this is. Hiding a real
		// album is a worse failure than showing a mildly redundant one.
		expect(meaningfulAlbum("Creep (Remastered)", "Creep", "Radiohead")).toBe(
			"Creep (Remastered)",
		);
	});

	it("keeps an album that merely contains the artist's name", () => {
		expect(
			meaningfulAlbum(
				"Arijit Singh - India Tour Hits",
				"Phir Le Aya Dil",
				"Arijit Singh",
			),
		).toBe("Arijit Singh - India Tour Hits");
	});

	it("treats blank and missing alike", () => {
		expect(meaningfulAlbum("   ", "t", "a")).toBeNull();
		expect(meaningfulAlbum(null, "t", "a")).toBeNull();
		expect(meaningfulAlbum(undefined, "t", "a")).toBeNull();
	});
});

describe("meaningfulAlbum — scrape debris", () => {
	it("refuses a view count posing as an album", () => {
		// Seen live on "Choo Lo": albumName was "23M views", straight off a
		// lyric channel's YouTube scrape, and it rendered in the hero credit.
		expect(
			meaningfulAlbum("23M views", "Choo Lo", "The Local Train"),
		).toBeNull();
		expect(meaningfulAlbum("4.5K Views", "x", "y")).toBeNull();
		expect(meaningfulAlbum("1,200,000 views", "x", "y")).toBeNull();
	});

	it("does not refuse an album that merely contains a number", () => {
		expect(meaningfulAlbum("25", "Hello", "Adele")).toBe("25");
		expect(meaningfulAlbum("4:44", "The Story of O.J.", "JAY-Z")).toBe("4:44");
	});
});
