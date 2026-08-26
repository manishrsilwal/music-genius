import { describe, expect, it, vi } from "vitest";

/**
 * The party's server operations (D-117): the host-key gate, the membership
 * gate, the idempotent advance, and the rate limiter. The pure model is
 * pinned in lib/party.test.ts; these pin what the WIRE may and may not do —
 * every 403 here is a promise that a guest cannot drive the party and a
 * stranger cannot join a queue they are not in.
 *
 * Runs against the in-memory cache adapter, which is the point: the store
 * contract is get/set with TTL, and these tests hold on anything honouring
 * it.
 */

vi.mock("./lyrics.server", () => ({
	getTrackPlayback: vi.fn(async () => ({
		youtubeId: "vid123",
		spotifyId: null,
	})),
}));

import { getTrackPlayback } from "./lyrics.server";
import {
	addPartyTrack,
	advanceParty,
	assertWithinLimit,
	controlParty,
	createParty,
	joinParty,
	syncParty,
} from "./party.server";

const SONG = { id: "1", title: "Creep", artist: "Radiohead", duration: 180 };
const SONG_B = {
	id: "2",
	title: "Karma Police",
	artist: "Radiohead",
	duration: 260,
};

async function freshRoom() {
	const created = await createParty("Asha");
	if (!created) throw new Error("create refused");
	return created;
}

describe("createParty / syncParty", () => {
	it("mints a room with the creator seated as host", async () => {
		const { roomId, memberId } = await freshRoom();
		const { view } = await syncParty(roomId, memberId);
		expect(view.members).toEqual([
			expect.objectContaining({ id: memberId, name: "Asha", host: true }),
		]);
	});

	it("never sends the host key over the wire", async () => {
		const { roomId } = await freshRoom();
		const { view } = await syncParty(roomId, null);
		expect((view as Record<string, unknown>).hostKey).toBeUndefined();
	});

	it("refuses a nameless host", async () => {
		expect(await createParty("   ")).toBeNull();
	});

	it("answers a dead link with a 404 in words", async () => {
		await expect(syncParty("nosuchroom", null)).rejects.toMatchObject({
			status: 404,
		});
	});
});

describe("joinParty", () => {
	it("seats a guest without host powers", async () => {
		const { roomId } = await freshRoom();
		const { memberId, view } = await joinParty(roomId, "Bo");
		const bo = view.members.find((m) => m.id === memberId);
		expect(bo?.host).toBe(false);
	});
});

describe("controlParty", () => {
	it("refuses a wrong key — only the host drives", async () => {
		const { roomId } = await freshRoom();
		await expect(
			controlParty(roomId, "not-the-key", { op: "pause" }),
		).rejects.toMatchObject({ status: 403 });
	});

	it("pauses with the right key", async () => {
		const { roomId, hostKey, memberId } = await freshRoom();
		await addPartyTrack(roomId, memberId, SONG);
		const { view } = await controlParty(roomId, hostKey, { op: "pause" });
		expect(view.playback.playing).toBe(false);
	});
});

describe("addPartyTrack", () => {
	it("refuses a stranger", async () => {
		const { roomId } = await freshRoom();
		await expect(
			addPartyTrack(roomId, "not-a-member", SONG),
		).rejects.toMatchObject({ status: 403 });
	});

	it("refuses a song with no player rather than queueing a dead spot", async () => {
		const { roomId, memberId } = await freshRoom();
		vi.mocked(getTrackPlayback).mockResolvedValueOnce({
			youtubeId: null,
			spotifyId: null,
		});
		await expect(addPartyTrack(roomId, memberId, SONG)).rejects.toMatchObject({
			status: 422,
		});
	});

	it("stamps the adder's name on the queued track", async () => {
		const { roomId, memberId } = await freshRoom();
		const { view } = await addPartyTrack(roomId, memberId, SONG);
		expect(view.queue[0]).toMatchObject({
			videoId: "vid123",
			addedBy: "Asha",
		});
	});
});

describe("advanceParty", () => {
	it("any member may advance — the party survives the host's pocket", async () => {
		const { roomId, memberId } = await freshRoom();
		await addPartyTrack(roomId, memberId, SONG);
		await addPartyTrack(roomId, memberId, SONG_B);
		const guest = await joinParty(roomId, "Bo");

		const { view } = await advanceParty(roomId, guest.memberId, 0);
		expect(view.currentIndex).toBe(1);
	});

	it("a stale `from` is a free no-op, not a restart", async () => {
		const { roomId, memberId } = await freshRoom();
		await addPartyTrack(roomId, memberId, SONG);
		await addPartyTrack(roomId, memberId, SONG_B);

		await advanceParty(roomId, memberId, 0);
		// The other four punctual clients arrive with the same stale claim.
		const { view } = await advanceParty(roomId, memberId, 0);
		expect(view.currentIndex).toBe(1);
	});

	it("refuses a stranger", async () => {
		const { roomId } = await freshRoom();
		await expect(advanceParty(roomId, "not-a-member", 0)).rejects.toMatchObject(
			{ status: 403 },
		);
	});
});

describe("assertWithinLimit", () => {
	it("admits up to the limit, then says slow down", async () => {
		// `create` allows 10 per window per address.
		for (let i = 0; i < 10; i++) {
			await assertWithinLimit("create", "203.0.113.7");
		}
		await expect(
			assertWithinLimit("create", "203.0.113.7"),
		).rejects.toMatchObject({ status: 429 });
	});

	it("buckets addresses separately", async () => {
		for (let i = 0; i < 10; i++) {
			await assertWithinLimit("create", "203.0.113.8");
		}
		await expect(
			assertWithinLimit("create", "203.0.113.9"),
		).resolves.toBeUndefined();
	});
});
