import { describe, expect, it } from "vitest";

import { stanzaOpacity, stanzaState } from "./motion";

/**
 * The stanza ladder is a contrast decision, not a styling preference, so it is
 * pinned here rather than left to whoever next edits the stylesheet.
 *
 * Measured against the reading ground, `oklch(0.155 0.03 265)`:
 *
 *   1.00  18.56:1   the line being read
 *   0.62   6.48:1   one either side
 *   0.42   3.29:1   everything else — the floor
 *
 * 0.38 measures 2.86:1, which is what D-053 rejected and what D-064's lighter
 * reading ground silently reintroduced (D-065). The player UI this grading came
 * from fades its third line to about 0.15 — 1.34:1 (D-074).
 */
describe("stanzaState", () => {
	it("lights the stanza being read", () => {
		expect(stanzaState(4, 4)).toBe("active");
	});

	it("puts one either side on the middle step", () => {
		expect(stanzaState(3, 4)).toBe("near");
		expect(stanzaState(5, 4)).toBe("near");
	});

	it("rests everything further away on the floor", () => {
		expect(stanzaState(2, 4)).toBe("idle");
		expect(stanzaState(6, 4)).toBe("idle");
		expect(stanzaState(40, 4)).toBe("idle");
	});

	it("is symmetric — reading back is reading", () => {
		// A reader scanning up to re-read a line must find it as legible as the
		// one below. Grading only downward would make the past harder to read
		// than the future.
		for (let distance = 0; distance < 5; distance++) {
			expect(stanzaState(10 - distance, 10)).toBe(
				stanzaState(10 + distance, 10),
			);
		}
	});

	it("handles the first stanza, where there is no line above", () => {
		expect(stanzaState(0, 0)).toBe("active");
		expect(stanzaState(1, 0)).toBe("near");
	});
});

describe("stanzaOpacity", () => {
	it("never goes below the measured readability floor", () => {
		// 0.42 is 3.29:1. Anything under it fails the 3:1 large-text floor, and
		// every value here sits on a line a reader may need to go back to.
		for (const value of Object.values(stanzaOpacity)) {
			expect(value).toBeGreaterThanOrEqual(0.42);
		}
	});

	it("keeps the three steps distinct enough to see", () => {
		// A ladder whose rungs are too close reads as a rendering artefact
		// rather than as depth.
		expect(stanzaOpacity.active - stanzaOpacity.near).toBeGreaterThan(0.15);
		expect(stanzaOpacity.near - stanzaOpacity.idle).toBeGreaterThan(0.15);
	});

	it("keeps the read line unambiguously the brightest", () => {
		expect(stanzaOpacity.active).toBeGreaterThan(stanzaOpacity.near);
		expect(stanzaOpacity.near).toBeGreaterThan(stanzaOpacity.idle);
	});
});
