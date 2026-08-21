import { describe, expect, it } from "vitest";

import {
	buildStanzas,
	lineKey,
	linePositionAt,
	parseSyncedLyrics,
	stanzaIndexAt,
	toStanzas,
} from "./lrc";

describe("parseSyncedLyrics", () => {
	it("parses [mm:ss.xx] timestamps into seconds", () => {
		const lines = parseSyncedLyrics("[00:01.52] Is this the real life?");
		expect(lines).toEqual([{ time: 1.52, text: "Is this the real life?" }]);
	});

	it("parses [mm:ss] without a fraction", () => {
		expect(parseSyncedLyrics("[01:05] Mama")[0]).toEqual({
			time: 65,
			text: "Mama",
		});
	});

	it("expands a line carrying several timestamps into one entry each", () => {
		// LRC uses this when a phrase repeats at different points in the song.
		const lines = parseSyncedLyrics(
			"[00:10.00][01:20.00] Nothing really matters",
		);
		expect(lines).toHaveLength(2);
		expect(lines.map((l) => l.time)).toEqual([10, 80]);
		expect(new Set(lines.map((l) => l.text))).toEqual(
			new Set(["Nothing really matters"]),
		);
	});

	it("drops metadata tags and untimed lines", () => {
		const lines = parseSyncedLyrics(
			[
				"[ar:Queen]",
				"[length:05:54]",
				"no timestamp here",
				"[00:02.00] real line",
			].join("\n"),
		);
		expect(lines).toEqual([{ time: 2, text: "real line" }]);
	});

	it("keeps a bracket that appears mid-lyric as text", () => {
		const lines = parseSyncedLyrics("[00:03.00] he said [loudly] no");
		expect(lines[0]?.text).toBe("he said [loudly] no");
	});

	it("returns lines in time order regardless of source order", () => {
		const lines = parseSyncedLyrics(
			["[00:20.00] second", "[00:05.00] first"].join("\n"),
		);
		expect(lines.map((l) => l.text)).toEqual(["first", "second"]);
	});
});

describe("toStanzas", () => {
	it("splits on timestamped blank lines", () => {
		const stanzas = toStanzas([
			{ time: 1, text: "one" },
			{ time: 2, text: "two" },
			{ time: 3, text: "" },
			{ time: 4, text: "three" },
		]);
		expect(stanzas).toHaveLength(2);
		expect(stanzas[0]?.lines.map((l) => l.text)).toEqual(["one", "two"]);
	});

	it("extends each stanza to the next one's start, not its own last line", () => {
		// The bug this guards: a stanza's final timestamp is when that LINE
		// begins. Using it as the stanza end makes auto-scroll advance early.
		const stanzas = toStanzas([
			{ time: 0, text: "a" },
			{ time: 10, text: "b" },
			{ time: 12, text: "" },
			{ time: 30, text: "c" },
		]);
		expect(stanzas[0]?.endTime).toBe(30);
		expect(stanzas[0]?.startTime).toBe(0);
	});

	it("leaves the final stanza's own end time in place", () => {
		const stanzas = toStanzas([
			{ time: 0, text: "a" },
			{ time: 10, text: "b" },
		]);
		expect(stanzas[0]?.endTime).toBe(10);
	});
});

describe("buildStanzas", () => {
	it("prefers synced lyrics and reports synced", () => {
		const result = buildStanzas({
			syncedLyrics: "[00:00.00] one\n[00:05.00] two",
			plainLyrics: "ignored",
		});
		expect(result.synced).toBe(true);
		expect(result.stanzas[0]?.lines).toHaveLength(2);
	});

	it("falls back to plain lyrics with no timings", () => {
		const result = buildStanzas({
			syncedLyrics: null,
			plainLyrics: "one\ntwo\n\nthree",
		});
		expect(result.synced).toBe(false);
		expect(result.stanzas).toHaveLength(2);
		expect(result.stanzas[0]?.startTime).toBeNull();
	});

	it("falls back when synced lyrics parse to nothing", () => {
		const result = buildStanzas({
			syncedLyrics: "[ar:only metadata]",
			plainLyrics: "words",
		});
		expect(result.synced).toBe(false);
		expect(result.stanzas[0]?.lines[0]?.text).toBe("words");
	});

	it("returns empty for an instrumental with no lyrics at all", () => {
		expect(buildStanzas({ syncedLyrics: null, plainLyrics: null })).toEqual({
			stanzas: [],
			synced: false,
		});
	});
});

describe("stanzaIndexAt", () => {
	const { stanzas } = buildStanzas({
		syncedLyrics:
			"[00:00.00] a\n[00:10.00] \n[00:10.00] b\n[00:20.00] \n[00:20.00] c",
		plainLyrics: null,
	});

	it("returns -1 before the first stanza starts", () => {
		const later = buildStanzas({
			syncedLyrics: "[00:05.00] a",
			plainLyrics: null,
		});
		expect(stanzaIndexAt(later.stanzas, 1)).toBe(-1);
	});

	it("finds the stanza containing the moment", () => {
		expect(stanzaIndexAt(stanzas, 0)).toBe(0);
		expect(stanzaIndexAt(stanzas, 15)).toBe(1);
	});

	it("holds on the last stanza past the end", () => {
		expect(stanzaIndexAt(stanzas, 9999)).toBe(stanzas.length - 1);
	});

	it("returns -1 for unsynced stanzas", () => {
		const plain = buildStanzas({ syncedLyrics: null, plainLyrics: "a\nb" });
		expect(stanzaIndexAt(plain.stanzas, 10)).toBe(-1);
	});
});

describe("undelimited files (gap-based fallback)", () => {
	/**
	 * Many LRCLIB uploads carry no blank lines at all. Left alone they collapse
	 * to one enormous stanza: the scroll-spy gets a single target, the focus
	 * effect does nothing, and auto-scroll never moves. "Choo Lo" arrives this
	 * way — 38 lines in one 187-second block.
	 */
	const undelimited = Array.from({ length: 24 }, (_, i) => {
		// Three-second lines, with a six-second break every six lines.
		const time = i * 3 + Math.floor(i / 6) * 6;
		return `[00:${String(time).padStart(2, "0")}.00] line ${i}`;
	}).join("\n");

	it("splits an undelimited run on timing", () => {
		const { stanzas } = buildStanzas({
			syncedLyrics: undelimited,
			plainLyrics: null,
		});
		expect(stanzas.length).toBeGreaterThan(1);
	});

	it("leaves a properly delimited file alone", () => {
		const delimited = [
			"[00:00.00] a",
			"[00:03.00] b",
			"[00:06.00] ",
			"[00:20.00] c",
			"[00:23.00] d",
		].join("\n");
		const { stanzas } = buildStanzas({
			syncedLyrics: delimited,
			plainLyrics: null,
		});
		// The 14s gap would split further, but the file delimits itself.
		expect(stanzas).toHaveLength(2);
	});

	it("keeps stanza ids unique after regrouping", () => {
		const { stanzas } = buildStanzas({
			syncedLyrics: undelimited,
			plainLyrics: null,
		});
		expect(new Set(stanzas.map((s) => s.id)).size).toBe(stanzas.length);
	});
});

describe("linePositionAt", () => {
	const { stanzas } = buildStanzas({
		syncedLyrics: [
			"[00:00.00] a",
			"[00:05.00] b",
			"[00:10.00] ",
			"[00:20.00] c",
		].join("\n"),
		plainLyrics: null,
	});

	it("returns null before the first line", () => {
		const later = buildStanzas({
			syncedLyrics: "[00:30.00] x",
			plainLyrics: null,
		});
		expect(linePositionAt(later.stanzas, 5)).toBeNull();
	});

	it("resolves to the line, not just the stanza", () => {
		expect(linePositionAt(stanzas, 0)?.key).toBe(lineKey(0, 0));
		expect(linePositionAt(stanzas, 6)?.key).toBe(lineKey(0, 1));
	});

	it("advances across stanza boundaries", () => {
		const position = linePositionAt(stanzas, 25);
		expect(position?.stanzaIndex).toBe(1);
		expect(position?.lineIndex).toBe(0);
	});

	it("moves far more often than stanza-level sync did", () => {
		// The regression this guards: stanza-level sync scrolled 8 times across
		// a 6-minute song, and not at all on an undelimited file.
		const keys = new Set<string>();
		for (let t = 0; t < 30; t++)
			keys.add(linePositionAt(stanzas, t)?.key ?? "none");
		expect(keys.size).toBeGreaterThan(2);
	});
});
