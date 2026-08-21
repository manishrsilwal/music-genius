import { describe, expect, it } from "vitest";

import { normaliseNames } from "./lrclib";

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
