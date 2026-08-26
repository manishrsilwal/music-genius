/**
 * Listen-party rooms (D-115) — server operations over the shared cache.
 *
 * The store is the SAME cache the lyrics use (Upstash in production, memory
 * in dev): a party is small, hot, and mortal, which is exactly what a TTL'd
 * key-value store is for. Every write renews the 24-hour TTL, so rooms die of
 * quiet rather than of age.
 *
 * Honesty about concurrency: mutations are read-modify-write with no lock, so
 * two writes landing in the same few milliseconds can lose one update — for a
 * room of friends adding songs by hand, an accepted MVP trade, said out loud
 * here rather than discovered later. The transport upgrade (OD-007's push
 * decision) is where a real serialisation point would arrive.
 */

import { getCache } from "../lib/cache";
import {
	addMember,
	addTrack,
	cleanName,
	createRoomState,
	newRoomId,
	newSecret,
	PARTY_TTL_S,
	type PartyRoom,
	type PartyTrack,
	type PartyView,
	seekTo,
	selectTrack,
	setPlaying,
	touchMember,
	toView,
} from "../lib/party";
import { getTrackPlayback } from "./lyrics.server";

const key = (id: string) => `party:v1:${id}`;

async function readRoom(id: string): Promise<PartyRoom | null> {
	return getCache().get<PartyRoom>(key(id));
}

async function writeRoom(room: PartyRoom, now: number): Promise<void> {
	await getCache().set(key(room.id), { ...room, updatedAt: now }, PARTY_TTL_S);
}

export interface PartyStateResponse {
	view: PartyView;
	/** For the client's clock-offset estimate; every response carries it. */
	serverNow: number;
}

export class PartyError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

/** The room, or a 404 in words — a dead party link should say so plainly. */
async function requireRoom(id: string): Promise<PartyRoom> {
	const room = await readRoom(id);
	if (!room) {
		throw new PartyError("This party has ended, or the link is wrong", 404);
	}
	return room;
}

export async function createParty(
	hostName: string,
): Promise<{ roomId: string; hostKey: string; memberId: string } | null> {
	const name = cleanName(hostName);
	if (!name) return null;

	const now = Date.now();
	const roomId = newRoomId();
	const hostKey = newSecret();
	const memberId = newSecret();

	let room = createRoomState(roomId, hostKey, now);
	room = addMember(room, { id: memberId, name, host: true }, now);
	await writeRoom(room, now);
	return { roomId, hostKey, memberId };
}

export async function joinParty(
	roomId: string,
	rawName: string,
): Promise<PartyStateResponse & { memberId: string }> {
	const name = cleanName(rawName);
	if (!name) throw new PartyError("A name is needed to join", 400);

	const now = Date.now();
	const room = await requireRoom(roomId);
	const memberId = newSecret();
	const joined = addMember(room, { id: memberId, name, host: false }, now);
	await writeRoom(joined, now);
	return { memberId, view: toView(joined, now), serverNow: now };
}

/**
 * The poll — and therefore the heartbeat. Reading is also how a member stays
 * at the party, so the seenAt touch is written back at most once per few
 * seconds per member to keep a quiet room from being all writes.
 */
export async function syncParty(
	roomId: string,
	memberId: string | null,
): Promise<PartyStateResponse> {
	const now = Date.now();
	const room = await requireRoom(roomId);

	if (memberId) {
		const member = room.members.find((m) => m.id === memberId);
		if (member && now - member.seenAt > 5000) {
			await writeRoom(
				{ ...room, members: touchMember(room.members, memberId, now) },
				now,
			);
		}
	}
	return { view: toView(room, now), serverNow: now };
}

/**
 * Queue a track. The party plays YouTube only (D-115), so the recording is
 * resolved here, at add time — a song with no player is refused with a
 * sentence rather than queued as a future dead spot in the party.
 */
export async function addPartyTrack(
	roomId: string,
	memberId: string,
	summary: {
		id: string;
		title: string;
		artist: string;
		duration: number | null;
	},
): Promise<PartyStateResponse> {
	const room = await requireRoom(roomId);
	const member = room.members.find((m) => m.id === memberId);
	if (!member) throw new PartyError("Join the party before adding songs", 403);

	const title = summary.title.slice(0, 200);
	const artist = summary.artist.slice(0, 200);
	const { youtubeId } = await getTrackPlayback(title, artist);
	if (!youtubeId) {
		throw new PartyError("No player for this one — try another version", 422);
	}

	const now = Date.now();
	const track: PartyTrack = {
		id: String(summary.id).slice(0, 40),
		title,
		artist,
		duration: summary.duration,
		videoId: youtubeId,
		addedBy: member.name,
	};

	// Re-read close to the write to shrink the race window named above.
	const fresh = await requireRoom(roomId);
	const next = addTrack(fresh, track, now);
	if (!next) throw new PartyError("The queue is full", 409);
	await writeRoom(next, now);
	return { view: toView(next, now), serverNow: now };
}

export type PartyOp =
	| { op: "play" }
	| { op: "pause" }
	| { op: "seek"; position: number }
	| { op: "select"; index: number };

/** Transport is the host's (D-115): every control demands the key. */
export async function controlParty(
	roomId: string,
	hostKey: string,
	action: PartyOp,
): Promise<PartyStateResponse> {
	const now = Date.now();
	const room = await requireRoom(roomId);
	if (room.hostKey !== hostKey) {
		throw new PartyError("Only the host drives the party", 403);
	}

	let next: PartyRoom | null;
	switch (action.op) {
		case "play":
			next = setPlaying(room, true, now);
			break;
		case "pause":
			next = setPlaying(room, false, now);
			break;
		case "seek":
			next = seekTo(room, Number(action.position) || 0, now);
			break;
		case "select":
			next = selectTrack(room, Math.trunc(Number(action.index)), now);
			break;
	}
	if (!next) throw new PartyError("Nothing at that spot in the queue", 400);
	await writeRoom(next, now);
	return { view: toView(next, now), serverNow: now };
}
