import { describe, expect, it } from "vitest";

import {
	HISTORY_LIMIT,
	type HistoryEntry,
	parseHistory,
	recordVisit,
	removeVisit,
} from "./history";

const track = (id: string): HistoryEntry => ({
	id,
	title: `Song ${id}`,
	artist: `Artist ${id}`,
});

describe("recordVisit", () => {
	it("puts the newest first", () => {
		const after = recordVisit([track("a")], track("b"));
		expect(after.map((e) => e.id)).toEqual(["b", "a"]);
	});

	it("moves a re-read track to the front rather than duplicating it", () => {
		const after = recordVisit([track("a"), track("b")], track("b"));
		expect(after.map((e) => e.id)).toEqual(["b", "a"]);
	});

	it("caps the shelf", () => {
		let entries: HistoryEntry[] = [];
		for (let i = 0; i < HISTORY_LIMIT + 4; i++) {
			entries = recordVisit(entries, track(String(i)));
		}
		expect(entries).toHaveLength(HISTORY_LIMIT);
		// The oldest fall off, not the newest.
		expect(entries[0]?.id).toBe(String(HISTORY_LIMIT + 3));
	});

	it("ignores an entry with no id", () => {
		const entries = [track("a")];
		expect(recordVisit(entries, { ...track(""), id: "" })).toBe(entries);
	});

	it("does not mutate the array it is given", () => {
		const entries = [track("a")];
		recordVisit(entries, track("b"));
		expect(entries.map((e) => e.id)).toEqual(["a"]);
	});
});

describe("removeVisit", () => {
	it("drops only the named track", () => {
		const after = removeVisit([track("a"), track("b")], "a");
		expect(after.map((e) => e.id)).toEqual(["b"]);
	});

	it("is a no-op for a track that is not there", () => {
		const after = removeVisit([track("a")], "zzz");
		expect(after.map((e) => e.id)).toEqual(["a"]);
	});
});

/**
 * Storage is user-writable and survives across versions of this code, so it is
 * parsed rather than trusted — the same rule the preference signature lives
 * under (D-047).
 */
describe("parseHistory", () => {
	it("reads back what was written", () => {
		const entries = [track("a"), track("b")];
		expect(parseHistory(JSON.stringify(entries))).toEqual(entries);
	});

	it("returns empty for anything unparseable", () => {
		expect(parseHistory(null)).toEqual([]);
		expect(parseHistory("")).toEqual([]);
		expect(parseHistory("not json")).toEqual([]);
		expect(parseHistory('{"not":"an array"}')).toEqual([]);
		expect(parseHistory("42")).toEqual([]);
	});

	it("drops entries that are not complete rows", () => {
		const raw = JSON.stringify([
			track("good"),
			{ id: "b" },
			{ id: "c", title: "x" },
			{ id: 7, title: "n", artist: "n" },
			{ id: "d", title: "", artist: "a" },
			null,
			"string",
		]);
		expect(parseHistory(raw).map((e) => e.id)).toEqual(["good"]);
	});

	it("drops duplicate ids, which would collide as React keys", () => {
		const raw = JSON.stringify([track("a"), track("a"), track("b")]);
		expect(parseHistory(raw).map((e) => e.id)).toEqual(["a", "b"]);
	});

	it("enforces the cap on read, not only on write", () => {
		// An older build, or a hand-edited value, can hold more than the cap.
		const raw = JSON.stringify(
			Array.from({ length: 40 }, (_, i) => track(String(i))),
		);
		expect(parseHistory(raw)).toHaveLength(HISTORY_LIMIT);
	});

	it("trims a padded id so the route parameter stays clean", () => {
		const raw = JSON.stringify([{ id: "  42  ", title: "t", artist: "a" }]);
		expect(parseHistory(raw)[0]?.id).toBe("42");
	});
});
