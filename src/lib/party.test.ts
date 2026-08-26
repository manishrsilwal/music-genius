import { describe, expect, it } from "vitest";
import type { PartyTrack } from "./party";
import {
	addMember,
	addTrack,
	advance,
	advanceFrom,
	cleanName,
	createRoomState,
	MEMBER_STALE_MS,
	newRoomId,
	positionAt,
	pruneMembers,
	QUEUE_LIMIT,
	seekTo,
	selectTrack,
	setPlaying,
	toView,
} from "./party";

/**
 * The party model decides what a room full of friends experiences together
 * (D-115). Every rule here is a promise: the clock math that keeps members in
 * step, the pruning that stops ghosts lingering at the party, and the view
 * that must never leak the host's key.
 */

const NOW = 1_000_000;

function track(id: string): PartyTrack {
	return {
		id,
		title: `Song ${id}`,
		artist: "Artist",
		duration: 180,
		videoId: `vid-${id}`,
		addedBy: "Asha",
	};
}

function room() {
	return createRoomState("roomid", "secret", NOW);
}

describe("positionAt", () => {
	it("advances the claim while playing", () => {
		const playback = { playing: true, position: 10, at: NOW };
		expect(positionAt(playback, NOW + 5000, 180)).toBe(15);
	});

	it("holds still while paused", () => {
		const playback = { playing: false, position: 10, at: NOW };
		expect(positionAt(playback, NOW + 60_000, 180)).toBe(10);
	});

	it("never runs past the end of the track", () => {
		const playback = { playing: true, position: 170, at: NOW };
		expect(positionAt(playback, NOW + 60_000, 180)).toBe(180);
	});

	it("survives a clock skewed into the past", () => {
		const playback = { playing: true, position: 10, at: NOW };
		expect(positionAt(playback, NOW - 5000, 180)).toBe(10);
	});
});

describe("queue", () => {
	it("first track starts the party without a second gesture", () => {
		const after = addTrack(room(), track("a"), NOW);
		expect(after?.currentIndex).toBe(0);
		expect(after?.playback.playing).toBe(true);
	});

	it("later tracks queue without stealing playback", () => {
		let r = addTrack(room(), track("a"), NOW);
		r = r && addTrack(r, track("b"), NOW);
		expect(r?.currentIndex).toBe(0);
		expect(r?.queue).toHaveLength(2);
	});

	it("swallows the double-click of the same song", () => {
		let r = addTrack(room(), track("a"), NOW);
		r = r && addTrack(r, track("a"), NOW);
		expect(r?.queue).toHaveLength(1);
	});

	it("refuses past the limit", () => {
		let r = room();
		for (let i = 0; i < QUEUE_LIMIT; i++) {
			const next = addTrack(r, track(String(i)), NOW);
			if (!next) throw new Error("limit hit early");
			r = next;
		}
		expect(addTrack(r, track("over"), NOW)).toBeNull();
	});

	it("selecting out of range is refused, not clamped", () => {
		const r = addTrack(room(), track("a"), NOW);
		expect(r && selectTrack(r, 5, NOW)).toBeNull();
	});

	it("advancing past the last track stops rather than loops", () => {
		const r = addTrack(room(), track("a"), NOW);
		const done = r && advance(r, NOW + 1000);
		expect(done?.currentIndex).toBe(0);
		expect(done?.playback.playing).toBe(false);
	});

	it("a repeated advance is a no-op, not a restart", () => {
		// The owner's loop report: the host's end-of-track timer re-fires
		// while its request is in flight, and every un-guarded repeat reset
		// the next song's clock to zero.
		let r = addTrack(room(), track("a"), NOW);
		r = r && addTrack(r, track("b"), NOW);
		const once = r && advanceFrom(r, 0, NOW + 1000);
		expect(once?.currentIndex).toBe(1);
		const again = once && advanceFrom(once, 0, NOW + 4000);
		expect(again).toBe(once);
	});
});

describe("transport", () => {
	it("pausing freezes the clock where the claim says it is", () => {
		const r = addTrack(room(), track("a"), NOW);
		const paused = r && setPlaying(r, false, NOW + 30_000);
		expect(paused?.playback.position).toBe(30);
		expect(paused?.playback.playing).toBe(false);
	});

	it("seeking below zero is clamped", () => {
		const r = addTrack(room(), track("a"), NOW);
		expect(r && seekTo(r, -10, NOW).playback.position).toBe(0);
	});
});

describe("members", () => {
	it("prunes a member whose heartbeat has stopped", () => {
		let r = addMember(room(), { id: "m1", name: "Asha", host: true }, NOW);
		r = addMember(r, { id: "m2", name: "Bo", host: false }, NOW);
		const later = NOW + MEMBER_STALE_MS + 1;
		const alive = pruneMembers(
			r.members.map((m) => (m.id === "m2" ? { ...m, seenAt: later } : m)),
			later,
		);
		expect(alive.map((m) => m.id)).toEqual(["m2"]);
	});

	it("rejoining does not mint a second chair", () => {
		let r = addMember(room(), { id: "m1", name: "Asha", host: true }, NOW);
		r = addMember(r, { id: "m1", name: "Asha", host: true }, NOW + 5000);
		expect(r.members).toHaveLength(1);
	});
});

describe("toView", () => {
	it("never leaks the host key", () => {
		const view = toView(room(), NOW) as Record<string, unknown>;
		expect(view.hostKey).toBeUndefined();
	});
});

describe("names and ids", () => {
	it("bounds and trims a display name", () => {
		expect(cleanName("  Asha  ")).toBe("Asha");
		expect(cleanName("x".repeat(60))?.length).toBe(24);
		expect(cleanName("   ")).toBeNull();
	});

	it("mints distinct room ids", () => {
		expect(newRoomId()).not.toBe(newRoomId());
		expect(newRoomId()).toHaveLength(10);
	});
});
