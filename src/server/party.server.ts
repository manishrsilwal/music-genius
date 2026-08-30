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
	addMessage,
	addReaction,
	addTrack,
	advanceFrom,
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

// v2: rooms gained `messages` and `reactions` (D-125) — a stored-shape
// change bumps the key the same commit (D-049). v1 rooms die unread; they
// were 24-hour ephemera by design.
const key = (id: string) => `party:v2:${id}`;

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

/**
 * End-of-track, fired by ANY member (D-117). It was the host's duty alone,
 * which meant the party stalled the moment the host pocketed their phone —
 * the current song ended and nothing could advance the queue. `advanceFrom`
 * made advancing idempotent (D-116), and idempotency is what makes
 * democratising it safe: five members hitting the end within a tick resolve
 * to one advance and four no-ops. Transport stays the host's; the queue
 * merely survives the host's absence.
 *
 * A no-op skips the write entirely, so a room full of punctual clients does
 * not turn one song ending into a write storm.
 */
export async function advanceParty(
	roomId: string,
	memberId: string,
	from: number,
): Promise<PartyStateResponse> {
	const now = Date.now();
	const room = await requireRoom(roomId);
	if (!room.members.some((m) => m.id === memberId)) {
		throw new PartyError("Join the party first", 403);
	}

	const next = advanceFrom(room, Math.trunc(Number(from)), now);
	if (next !== room) await writeRoom(next, now);
	return { view: toView(next, now), serverNow: now };
}

/** Say something in the side chat (D-125). Members only. */
export async function chatParty(
	roomId: string,
	memberId: string,
	text: string,
): Promise<PartyStateResponse> {
	const now = Date.now();
	const room = await requireRoom(roomId);
	const next = addMessage(room, memberId, String(text), now);
	if (!next) {
		throw new PartyError("Join the party first, and say something", 400);
	}
	await writeRoom(next, now);
	return { view: toView(next, now), serverNow: now };
}

/** React (D-125). Members only; emoji enum-checked in the model. */
export async function reactParty(
	roomId: string,
	memberId: string,
	emoji: string,
): Promise<PartyStateResponse> {
	const now = Date.now();
	const room = await requireRoom(roomId);
	const next = addReaction(room, memberId, String(emoji), now);
	if (!next) {
		throw new PartyError("Join the party first, and pick a real one", 400);
	}
	await writeRoom(next, now);
	return { view: toView(next, now), serverNow: now };
}

/* -------------------------------------------------------------------------
   Rate limiting (D-117)

   The wire is unauthenticated by design — the link is the invitation — which
   also means anyone can script it. Fixed-window counters per IP in the same
   cache: approximate under concurrency (two requests can read the same count
   in the same millisecond), which is the right trade for a limiter whose job
   is stopping floods, not billing.
   ---------------------------------------------------------------------- */

const LIMITS = {
	/** Rooms are cheap to mint and expensive to store; the tightest limit. */
	create: { limit: 10, windowS: 600 },
	join: { limit: 30, windowS: 600 },
	/** Every add costs an upstream playback lookup; bounded accordingly. */
	add: { limit: 120, windowS: 600 },
	/** Talk is cheap but stored; a message a second is a lively room. */
	chat: { limit: 60, windowS: 600 },
	/** Reactions are the cheapest write and the most tempting to spam. */
	react: { limit: 180, windowS: 600 },
} as const;

export async function assertWithinLimit(
	scope: keyof typeof LIMITS,
	ip: string | null,
): Promise<void> {
	const { limit, windowS } = LIMITS[scope];
	const bucket = Math.floor(Date.now() / (windowS * 1000));
	const key = `party:rl:${scope}:${ip ?? "unknown"}:${bucket}`;
	const count = (await getCache().get<number>(key)) ?? 0;
	if (count >= limit) {
		throw new PartyError("Slow down a moment — too many requests", 429);
	}
	await getCache().set(key, count + 1, windowS);
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
