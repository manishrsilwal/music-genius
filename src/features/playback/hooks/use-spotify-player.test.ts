import { describe, expect, it } from "vitest";

import { looksLikePreview } from "./use-spotify-player";

/**
 * The preview detector (D-114) decides two things a reader sees: whether the
 * notice says "sign in for the full song", and whether the drift detector
 * (D-075) is allowed to mis-read the signed-out preview as "another cut" and
 * wrongly default sync off. Both sides of every boundary are pinned.
 */
describe("looksLikePreview", () => {
	it("recognises the ~30s signed-out preview against full-length timings", () => {
		expect(looksLikePreview(29.7, 182)).toBe(true);
		expect(looksLikePreview(30, 240)).toBe(true);
	});

	it("does not accuse before the clock has reported", () => {
		expect(looksLikePreview(0, 182)).toBe(false);
	});

	it("treats a full-length duration as the song", () => {
		expect(looksLikePreview(182, 182)).toBe(false);
		expect(looksLikePreview(36, 182)).toBe(false);
	});

	it("says nothing when the lyrics duration is unknown or short", () => {
		// A 30-second song exists; without a full-length reference the short
		// clock is unjudgeable.
		expect(looksLikePreview(30, null)).toBe(false);
		expect(looksLikePreview(30, 45)).toBe(false);
	});
});
