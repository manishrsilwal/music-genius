import { describe, expect, it } from "vitest";

import { resolvePlayer } from "./use-playback-source";

/**
 * The decision table behind which player a track gets (D-112). Pinned because
 * every row is a promise to a reader: the Spotify chooser must get the embed
 * when it exists, YouTube when it does not (never silence, D-055), and the
 * `borrowed` flag is the only thing standing between "why is there a video?"
 * and an answer.
 */
describe("resolvePlayer", () => {
	it("gives the Spotify chooser the embed when a match exists", () => {
		expect(resolvePlayer("spotify", "abc123", "yt1")).toEqual({
			source: "spotify",
			borrowed: false,
		});
	});

	it("borrows YouTube when Spotify has no match", () => {
		expect(resolvePlayer("spotify", null, "yt1")).toEqual({
			source: "youtube",
			borrowed: true,
		});
	});

	it("does not claim to borrow what does not exist", () => {
		// Neither id: the bar's own no-recording path owns this state, and a
		// "playing from YouTube" notice above a dead player would be a lie.
		expect(resolvePlayer("spotify", null, null)).toEqual({
			source: "youtube",
			borrowed: false,
		});
	});

	it("gives the YouTube chooser YouTube even when Spotify matched", () => {
		expect(resolvePlayer("youtube", "abc123", "yt1")).toEqual({
			source: "youtube",
			borrowed: false,
		});
	});

	it("defaults to YouTube while the question is unanswered", () => {
		// The caller shows the question in this state; the default only
		// decides which "finding the recording" path renders behind it.
		expect(resolvePlayer(null, "abc123", "yt1").source).toBe("youtube");
		expect(resolvePlayer(undefined, "abc123", "yt1").source).toBe("youtube");
	});
});
