import { describe, expect, it } from "vitest";

import { describeYouTubeError } from "./use-youtube-player";

/**
 * The point of this mapping is that no failure can render as an endless
 * "Loading" (D-054), so the property that matters is totality: every input
 * produces a sentence, including codes YouTube has not documented yet.
 */
describe("describeYouTubeError", () => {
	it("names the embedding restriction, under both codes", () => {
		// 101 and 150 are the same condition reported twice, and it is the
		// common one: rights holders who allow a video on youtube.com only.
		expect(describeYouTubeError(101)).toBe(
			"the owner does not allow embedding",
		);
		expect(describeYouTubeError(150)).toBe(
			"the owner does not allow embedding",
		);
	});

	it("distinguishes a removed video from a restricted one", () => {
		expect(describeYouTubeError(100)).toBe("the video has been removed");
		expect(describeYouTubeError(100)).not.toBe(describeYouTubeError(101));
	});

	it("covers the remaining documented codes", () => {
		expect(describeYouTubeError(2)).toBe("invalid video id");
		expect(describeYouTubeError(5)).toBe("the player could not start");
	});

	it("still returns a sentence for a code it has never seen", () => {
		for (const code of [0, 3, 42, 151, -1, Number.MAX_SAFE_INTEGER]) {
			expect(describeYouTubeError(code)).toBe("playback failed");
		}
	});

	it("never returns an empty string", () => {
		for (const code of [2, 5, 100, 101, 150, 999]) {
			expect(describeYouTubeError(code).length).toBeGreaterThan(0);
		}
	});
});
