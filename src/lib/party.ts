/**
 * The listen party's model (D-115) — pure, so every rule that decides what a
 * room full of friends experiences is testable without a server.
 *
 * A party is synchronised STATE, not streamed audio: each member's browser
 * plays its own visible YouTube player, and the room agrees on which track,
 * what position, playing or paused. The clock math does the work — the room
 * records "position P as of server-time T", and every client computes where
 * the song is now — so even a slow poll keeps the members together.
 */

export interface PartyTrack {
	/** LRCLIB id — the same id the track pages use. */
	id: string;
	title: string;
	artist: string;
	/** Seconds; null when LRCLIB did not record one. */
	duration: number | null;
	/** Resolved when the track is queued. A party plays YouTube only (D-115). */
	videoId: string;
	/** Who queued it, for the "added by" line. */
	addedBy: string;
}

export interface PartyMember {
	id: string;
	name: string;
	/** Server ms; the poll is the heartbeat. */
	seenAt: number;
	host: boolean;
}

/** One line in the party's side chat (D-125). */
export interface PartyMessage {
	memberId: string;
	/** Snapshotted at send time, so a message survives its author leaving. */
	name: string;
	text: string;
	/** Server ms. */
	at: number;
}

/**
 * One live reaction (D-125). Ephemeral by design: reactions are a burst of
 * presence, not a record — `toView` drops them once they age out.
 */
export interface PartyReaction {
	memberId: string;
	name: string;
	emoji: string;
	/** Server ms. */
	at: number;
}

/** The playback claim: position `position` (seconds) as of server-time `at`. */
export interface PartyPlayback {
	playing: boolean;
	position: number;
	at: number;
}

export interface PartyRoom {
	id: string;
	/** Proof of hosting — returned once at creation, never in the view. */
	hostKey: string;
	createdAt: number;
	updatedAt: number;
	members: PartyMember[];
	queue: PartyTrack[];
	/** -1 until the first track is queued. */
	currentIndex: number;
	playback: PartyPlayback;
	/** The side chat (D-125), capped at CHAT_LIMIT — a room, not an archive. */
	messages: PartyMessage[];
	/** Live reactions (D-125); stale ones are pruned on every write and view. */
	reactions: PartyReaction[];
}

/** What every member may see — the room without its secret. */
export type PartyView = Omit<PartyRoom, "hostKey">;

/* ------------------------------------------------------------------ */

/** Rooms die of quiet, not of age: every write renews this. */
export const PARTY_TTL_S = 60 * 60 * 24;

/**
 * A member whose poll has not arrived in this long has left. Polling runs at
 * 2s, so this forgives a dozen missed beats — a tab in the background, a
 * phone that briefly slept — without keeping ghosts at the party.
 */
export const MEMBER_STALE_MS = 25_000;

/** Nobody queues a hundred songs at a house party in good faith. */
export const QUEUE_LIMIT = 100;

/**
 * The side chat keeps a room's worth of talk, not a transcript (D-125): 50
 * lines covers everything on screen plus scrollback context, and keeps the
 * poll payload bounded — every member re-downloads the room every 2s.
 */
export const CHAT_LIMIT = 50;
export const CHAT_TEXT_LIMIT = 280;

/**
 * The reaction vocabulary (D-125). A fixed set, not free emoji: validated
 * like every enum here, renderable as buttons, and immune to 4-byte
 * surprises in storage.
 */
export const REACTIONS = ["🔥", "💜", "😭", "🕺", "🎯", "😂"] as const;

/** How long a reaction stays on screen — a burst, not a badge. */
export const REACTION_TTL_MS = 8_000;
const REACTION_CAP = 30;

const NAME_LIMIT = 24;

/** Unambiguous, lowercase, unguessable enough for a link shared in a chat. */
const ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomFrom(alphabet: string, length: number): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let out = "";
	for (const byte of bytes) out += alphabet[byte % alphabet.length];
	return out;
}

export function newRoomId(): string {
	return randomFrom(ID_ALPHABET, 10);
}

export function newSecret(): string {
	return randomFrom(ID_ALPHABET, 24);
}

/** A display name a room can live with: trimmed, bounded, never empty. */
export function cleanName(raw: string): string | null {
	const name = raw.trim().slice(0, NAME_LIMIT);
	return name.length > 0 ? name : null;
}

export function createRoomState(
	id: string,
	hostKey: string,
	now: number,
): PartyRoom {
	return {
		id,
		hostKey,
		createdAt: now,
		updatedAt: now,
		members: [],
		queue: [],
		currentIndex: -1,
		playback: { playing: false, position: 0, at: now },
		messages: [],
		reactions: [],
	};
}

/* ------------------------------------------------------------------ */

/**
 * Where the song is right now, from the room's claim. Clamped below by zero
 * and above by the track's recorded duration, so a stale claim cannot ask a
 * player to seek past the end.
 */
export function positionAt(
	playback: PartyPlayback,
	now: number,
	duration: number | null,
): number {
	const elapsed = playback.playing
		? Math.max(0, (now - playback.at) / 1000)
		: 0;
	const position = playback.position + elapsed;
	if (duration !== null && duration > 0) return Math.min(position, duration);
	return position;
}

/** The poll doubles as the heartbeat; absence is how members leave. */
export function pruneMembers(
	members: PartyMember[],
	now: number,
): PartyMember[] {
	return members.filter((member) => now - member.seenAt <= MEMBER_STALE_MS);
}

export function touchMember(
	members: PartyMember[],
	id: string,
	now: number,
): PartyMember[] {
	return members.map((member) =>
		member.id === id ? { ...member, seenAt: now } : member,
	);
}

export function addMember(
	room: PartyRoom,
	member: Omit<PartyMember, "seenAt">,
	now: number,
): PartyRoom {
	// Rejoining is idempotent: a refresh must not mint a second chair.
	const others = room.members.filter((existing) => existing.id !== member.id);
	return { ...room, members: [...others, { ...member, seenAt: now }] };
}

/**
 * A queued track starts the party when it is the first: an empty room with a
 * fresh song should not also demand the host find the play button.
 */
export function addTrack(
	room: PartyRoom,
	track: PartyTrack,
	now: number,
): PartyRoom | null {
	if (room.queue.length >= QUEUE_LIMIT) return null;
	// The same song twice in a row is a misclick, not a request.
	if (room.queue.at(-1)?.id === track.id) return room;

	const queue = [...room.queue, track];
	if (room.currentIndex === -1) {
		return {
			...room,
			queue,
			currentIndex: 0,
			playback: { playing: true, position: 0, at: now },
		};
	}
	return { ...room, queue };
}

/** Jump to a queued track and start it from the top. */
export function selectTrack(
	room: PartyRoom,
	index: number,
	now: number,
): PartyRoom | null {
	if (index < 0 || index >= room.queue.length) return null;
	return {
		...room,
		currentIndex: index,
		playback: { playing: true, position: 0, at: now },
	};
}

export function setPlaying(
	room: PartyRoom,
	playing: boolean,
	now: number,
): PartyRoom {
	const duration = room.queue[room.currentIndex]?.duration ?? null;
	return {
		...room,
		playback: {
			playing,
			// Freeze or restart the clock from where the claim says we are.
			position: positionAt(room.playback, now, duration),
			at: now,
		},
	};
}

export function seekTo(
	room: PartyRoom,
	position: number,
	now: number,
): PartyRoom {
	return {
		...room,
		playback: {
			...room.playback,
			position: Math.max(0, position),
			at: now,
		},
	};
}

/** The next song, or the end of the party's queue: stopped, not looping. */
export function advance(room: PartyRoom, now: number): PartyRoom {
	const next = room.currentIndex + 1;
	if (next >= room.queue.length) return setPlaying(room, false, now);
	return selectTrack(room, next, now) ?? room;
}

/**
 * Advance only if the room still stands where the caller thought (D-115,
 * amended). The host's end-of-track fires from a timer while its own request
 * is in flight, so the same advance arrives more than once — un-guarded,
 * each repeat re-selected the next track and reset its clock to zero, which
 * the owner heard as the first seconds looping. A stale `from` makes the
 * repeat a no-op instead of a restart.
 */
export function advanceFrom(
	room: PartyRoom,
	from: number,
	now: number,
): PartyRoom {
	if (room.currentIndex !== from) return room;
	return advance(room, now);
}

/**
 * Say something in the side chat (D-125). Members only; blank and oversized
 * text is refused rather than trimmed into surprise. Null = no change.
 */
export function addMessage(
	room: PartyRoom,
	memberId: string,
	text: string,
	now: number,
): PartyRoom | null {
	const member = room.members.find((entry) => entry.id === memberId);
	if (!member) return null;
	const trimmed = text.trim();
	if (trimmed.length === 0 || trimmed.length > CHAT_TEXT_LIMIT) return null;
	const messages = [
		...room.messages,
		{ memberId, name: member.name, text: trimmed, at: now },
	].slice(-CHAT_LIMIT);
	return { ...room, messages, updatedAt: now };
}

/**
 * React (D-125). Enum-checked against REACTIONS; stale reactions are pruned
 * on the same write, so the array cannot grow past a burst. Null = no change.
 */
export function addReaction(
	room: PartyRoom,
	memberId: string,
	emoji: string,
	now: number,
): PartyRoom | null {
	const member = room.members.find((entry) => entry.id === memberId);
	if (!member) return null;
	if (!(REACTIONS as readonly string[]).includes(emoji)) return null;
	const reactions = [
		...room.reactions.filter((entry) => now - entry.at < REACTION_TTL_MS),
		{ memberId, name: member.name, emoji, at: now },
	].slice(-REACTION_CAP);
	return { ...room, reactions, updatedAt: now };
}

/** The room as members see it: pruned of ghosts, stripped of the secret. */
export function toView(room: PartyRoom, now: number): PartyView {
	const { hostKey: _hostKey, ...view } = room;
	return {
		...view,
		members: pruneMembers(room.members, now),
		// Reactions age out of the VIEW too, so a member who reacts and then
		// nobody writes still sees the burst fade on the next poll.
		reactions: room.reactions.filter(
			(entry) => now - entry.at < REACTION_TTL_MS,
		),
	};
}

/**
 * The reader first, then the host, then everyone else in join order (D-118).
 * A member list is read egocentrically — "am I in?" is the first question a
 * joiner asks it — so the self chip leads even when the self is a guest.
 * Stable sort, so join order survives within each rank.
 */
export function orderMembers(
	members: PartyMember[],
	selfId: string | null,
): PartyMember[] {
	const rank = (member: PartyMember) =>
		member.id === selfId ? 0 : member.host ? 1 : 2;
	return [...members].sort((a, b) => rank(a) - rank(b));
}
