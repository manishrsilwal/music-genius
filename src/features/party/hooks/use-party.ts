import { useCallback, useEffect, useRef, useState } from "react";

import type { PartyView } from "@/lib/party";
import type { TrackSummary } from "@/lib/types";

/**
 * The client half of the listen party (D-115).
 *
 * Polling, not push — the deliberate MVP transport. Because the room's
 * playback state is a CLAIM ("position P as of server-time T") rather than a
 * stream of ticks, a two-second poll is enough to keep every member's player
 * within a beat of the host: the clock math happens locally, the poll only
 * carries changes of mind.
 *
 * Identity is local, like everything about this product's readers: a display
 * name in `tle:party-name`, a member id (and, for the host, the room key)
 * per-room in `tle:party-session:*`. No accounts anywhere (D-115).
 */

const POLL_MS = 2000;
const NAME_KEY = "tle:party-name";
const sessionKey = (roomId: string) => `tle:party-session:${roomId}`;

export interface PartySession {
	memberId: string;
	/** Present only in the creator's browser — hosting rides this. */
	hostKey: string | null;
}

interface PartyState {
	view: PartyView;
	serverNow: number;
}

export function readStoredName(): string {
	try {
		return window.localStorage.getItem(NAME_KEY) ?? "";
	} catch {
		return "";
	}
}

export function storeName(name: string): void {
	try {
		window.localStorage.setItem(NAME_KEY, name);
	} catch {
		// The name simply does not persist. The party still works.
	}
}

export function storeSession(roomId: string, session: PartySession): void {
	try {
		window.localStorage.setItem(sessionKey(roomId), JSON.stringify(session));
	} catch {
		/* ephemeral membership; a refresh will re-join */
	}
}

function readSession(roomId: string): PartySession | null {
	try {
		const raw = window.localStorage.getItem(sessionKey(roomId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as PartySession;
		return parsed.memberId ? parsed : null;
	} catch {
		return null;
	}
}

async function post(
	body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const response = await fetch("/api/party", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const payload = (await response.json()) as Record<string, unknown>;
	if (!response.ok) {
		throw new Error(String(payload.error ?? "The party server missed a beat"));
	}
	return payload;
}

export interface PartyRoomState {
	/** Undefined while the first poll is in flight; null when the room is gone. */
	view: PartyView | null | undefined;
	/** Why the room is gone, in words. */
	gone: string | null;
	/** Undefined while storage is being read; null = not a member yet. */
	session: PartySession | null | undefined;
	isHost: boolean;
	/** Server-clock estimate, for the position math. */
	now: () => number;
	join: (name: string) => Promise<void>;
	add: (track: TrackSummary) => Promise<void>;
	control: (
		control:
			| { op: "play" }
			| { op: "pause" }
			| { op: "seek"; position: number }
			| { op: "select"; index: number },
	) => Promise<void>;
	/**
	 * End-of-track, any member's to call (D-117): conditional on `from`
	 * server-side, so everyone firing it together costs one advance.
	 */
	advance: (from: number) => Promise<void>;
	/** Say something in the side chat (D-125). */
	chat: (text: string) => Promise<void>;
	/** React with one of REACTIONS (D-125). */
	react: (emoji: string) => Promise<void>;
}

export function usePartyRoom(roomId: string): PartyRoomState {
	const [state, setState] = useState<PartyState | null | undefined>(undefined);
	const [gone, setGone] = useState<string | null>(null);
	const [session, setSession] = useState<PartySession | null | undefined>(
		undefined,
	);
	// serverNow minus Date.now() at receipt; re-estimated on every response.
	const offsetRef = useRef(0);

	useEffect(() => {
		setSession(readSession(roomId));
	}, [roomId]);

	const absorb = useCallback((payload: Record<string, unknown>) => {
		const next = payload as unknown as PartyState;
		offsetRef.current = next.serverNow - Date.now();
		setState(next);
		setGone(null);
	}, []);

	/*
	 * The poll — also the heartbeat. It runs in HIDDEN tabs too (D-115,
	 * amended on the owner's report): a backgrounded tab keeps playing audio,
	 * so it must keep receiving the room — the first cut skipped hidden tabs
	 * and a host's "pause for everyone" waited until each guest looked at the
	 * screen. Presence is unchanged: a member with audio running IS at the
	 * party. Browsers throttle background timers, so a long-hidden tab may
	 * react late; the visibilitychange poll below catches it up the moment it
	 * returns.
	 */
	useEffect(() => {
		if (session === undefined) return;
		let cancelled = false;

		const poll = async () => {
			try {
				const member = session
					? `&member=${encodeURIComponent(session.memberId)}`
					: "";
				const response = await fetch(
					`/api/party?room=${encodeURIComponent(roomId)}${member}`,
				);
				const payload = (await response.json()) as Record<string, unknown>;
				if (cancelled) return;
				if (!response.ok) {
					if (response.status === 404) {
						setState(null);
						setGone(String(payload.error ?? "This party has ended"));
					}
					return;
				}
				absorb(payload);
			} catch {
				// A missed poll is not an event; the next one is two seconds away.
			}
		};

		poll();
		const timer = setInterval(poll, POLL_MS);
		const onVisible = () => {
			if (!document.hidden) poll();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			cancelled = true;
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [roomId, session, absorb]);

	const join = useCallback(
		async (name: string) => {
			const payload = await post({ action: "join", room: roomId, name });
			const next: PartySession = {
				memberId: String(payload.memberId),
				hostKey: null,
			};
			storeName(name);
			storeSession(roomId, next);
			setSession(next);
			absorb(payload);
		},
		[roomId, absorb],
	);

	const add = useCallback(
		async (track: TrackSummary) => {
			if (!session) throw new Error("Join the party before adding songs");
			const payload = await post({
				action: "add",
				room: roomId,
				member: session.memberId,
				track: {
					id: track.id,
					title: track.title,
					artist: track.artist,
					duration: track.duration,
				},
			});
			absorb(payload);
		},
		[roomId, session, absorb],
	);

	const control = useCallback<PartyRoomState["control"]>(
		async (op) => {
			if (!session?.hostKey) return;
			const payload = await post({
				action: "control",
				room: roomId,
				hostKey: session.hostKey,
				control: op,
			});
			absorb(payload);
		},
		[roomId, session, absorb],
	);

	const advance = useCallback(
		async (from: number) => {
			if (!session) return;
			const payload = await post({
				action: "advance",
				room: roomId,
				member: session.memberId,
				from,
			});
			absorb(payload);
		},
		[roomId, session, absorb],
	);

	const chat = useCallback(
		async (text: string) => {
			if (!session) throw new Error("Join the party before chatting");
			const payload = await post({
				action: "chat",
				room: roomId,
				member: session.memberId,
				text,
			});
			absorb(payload);
		},
		[roomId, session, absorb],
	);

	const react = useCallback(
		async (emoji: string) => {
			if (!session) return;
			const payload = await post({
				action: "react",
				room: roomId,
				member: session.memberId,
				emoji,
			});
			absorb(payload);
		},
		[roomId, session, absorb],
	);

	return {
		view: state === undefined ? undefined : (state?.view ?? null),
		gone,
		session,
		isHost: Boolean(session?.hostKey),
		now: () => Date.now() + offsetRef.current,
		join,
		add,
		control,
		advance,
		chat,
		react,
	};
}
