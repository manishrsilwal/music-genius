import { describe, expect, it } from "vitest";
import type { PartyTrack } from "./party";
import {
	addMember,
	addMessage,
	addReaction,
	addTrack,
	advance,
	advanceFrom,
	cleanName,
	createRoomState,
	MEMBER_STALE_MS,
	newRoomId,
	orderMembers,
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

	it("orders the reader first, then the host, then join order", () => {
		let r = addMember(room(), { id: "h", name: "Asha", host: true }, NOW);
		r = addMember(r, { id: "g1", name: "Bo", host: false }, NOW + 1);
		r = addMember(r, { id: "g2", name: "Chi", host: false }, NOW + 2);
		// A guest reading the list sees themselves before the host.
		expect(orderMembers(r.members, "g2").map((m) => m.id)).toEqual([
			"g2",
			"h",
			"g1",
		]);
		// The host reading it is both self and host — one chip, first.
		expect(orderMembers(r.members, "h").map((m) => m.id)).toEqual([
			"h",
			"g1",
			"g2",
		]);
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

describe("chat and reactions (D-125)", () => {
	const withMember = () => {
		const room = createRoomState("room1", "secret", NOW);
		return addMember(room, { id: "m1", name: "Asha", host: true }, NOW);
	};

	it("members can talk; strangers cannot", () => {
		const room = withMember();
		const spoke = addMessage(room, "m1", "  this bridge!!  ", NOW + 10);
		expect(spoke?.messages).toHaveLength(1);
		expect(spoke?.messages[0]?.text).toBe("this bridge!!");
		expect(spoke?.messages[0]?.name).toBe("Asha");
		expect(addMessage(room, "ghost", "hi", NOW)).toBeNull();
	});

	it("refuses blank and oversized messages", () => {
		const room = withMember();
		expect(addMessage(room, "m1", "   ", NOW)).toBeNull();
		expect(addMessage(room, "m1", "x".repeat(300), NOW)).toBeNull();
	});

	it("keeps a room's worth of talk, not a transcript", () => {
		let room = withMember();
		for (let i = 0; i < 60; i++) {
			const next = addMessage(room, "m1", `line ${i}`, NOW + i);
			if (next) room = next;
		}
		expect(room.messages).toHaveLength(50);
		expect(room.messages[0]?.text).toBe("line 10");
	});

	it("reactions are enum-checked and expire from the view", () => {
		const room = withMember();
		expect(addReaction(room, "m1", "💣", NOW)).toBeNull();
		const reacted = addReaction(room, "m1", "🔥", NOW);
		expect(reacted?.reactions).toHaveLength(1);
		if (!reacted) throw new Error("reaction refused");
		// Fresh in the view now, gone once the burst ages out.
		expect(toView(reacted, NOW + 1000).reactions).toHaveLength(1);
		expect(toView(reacted, NOW + 9000).reactions).toHaveLength(0);
	});

	it("a write prunes stale reactions rather than hoarding them", () => {
		const room = withMember();
		const first = addReaction(room, "m1", "🔥", NOW);
		if (!first) throw new Error("reaction refused");
		const second = addReaction(first, "m1", "💜", NOW + 10_000);
		expect(second?.reactions).toHaveLength(1);
		expect(second?.reactions[0]?.emoji).toBe("💜");
	});

	it("the view still never leaks the host key", () => {
		const room = withMember();
		const spoke = addMessage(room, "m1", "hello", NOW);
		if (!spoke) throw new Error("message refused");
		expect("hostKey" in toView(spoke, NOW)).toBe(false);
	});
});
