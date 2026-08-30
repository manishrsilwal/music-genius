import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { readStoredName, usePartyRoom } from "@/features/party/hooks/use-party";
import { useYouTubePlayer } from "@/features/playback/hooks/use-youtube-player";
import { orderMembers, positionAt, REACTIONS } from "@/lib/party";
import type { TrackSummary } from "@/lib/types";

/**
 * v2 party room (D-125): the watch-party cut. Synced playback rides the
 * same claim-plus-local-clock machinery as v1's room (the follower and the
 * democratised advance are copied contracts, not reinventions — D-115/116/
 * 117 all still apply). What v2 adds is the social layer the brief asked
 * for: presence as sticker avatars, live reactions that pop and fade
 * (ephemeral by design — the server prunes them at 8s), and a side chat.
 *
 * UX card applied: presence is announced as ONE atomic status ("4 in the
 * room"), never a live region per avatar.
 */

export const Route = createFileRoute("/v2/party/$roomId")({
	head: () => ({ meta: [{ title: "Listen party — Refrain v2" }] }),
	component: PartyRoomV2,
});

const TICK_MS = 500;
const SEEK_TOLERANCE_S = 3;

function PartyRoomV2() {
	const { roomId } = Route.useParams();
	const party = usePartyRoom(roomId);
	const { view, session, gone, isHost, now } = party;
	const current =
		view && view.currentIndex >= 0
			? (view.queue[view.currentIndex] ?? null)
			: null;

	const mountRef = useRef<HTMLDivElement>(null);
	const player = useYouTubePlayer(current?.videoId ?? null, mountRef);
	const playerRef = useRef(player);
	playerRef.current = player;

	const [tick, setTick] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setTick((t) => t + 1), TICK_MS);
		return () => clearInterval(timer);
	}, []);

	const position =
		view && current ? positionAt(view.playback, now(), current.duration) : 0;

	/* The follower — same contract as v1's room (D-115). */
	// biome-ignore lint/correctness/useExhaustiveDependencies: tick and view ARE the schedule
	useEffect(() => {
		if (!view || !current) return;
		const p = playerRef.current;
		if (!p.ready) return;
		if (view.playback.playing !== p.playing) p.toggle();
		if (
			view.playback.playing &&
			Math.abs(p.currentTime - position) > SEEK_TOLERANCE_S
		) {
			p.seek(position);
		}
	}, [tick, view]);

	/* End of track — every member's duty, one advance total (D-117). */
	const advancedFrom = useRef(-1);
	// biome-ignore lint/correctness/useExhaustiveDependencies: tick IS the schedule
	useEffect(() => {
		if (!view || !current?.duration) return;
		if (!view.playback.playing) return;
		if (position < current.duration - 0.75) return;
		if (advancedFrom.current === view.currentIndex) return;
		advancedFrom.current = view.currentIndex;
		party.advance(view.currentIndex).catch(() => {
			advancedFrom.current = -1;
		});
	}, [tick]);

	if (gone) return <p className="disco__empty">{gone}</p>;
	if (view === undefined || session === undefined) {
		return <p className="disco__empty">Finding the room…</p>;
	}
	if (view === null)
		return <p className="disco__empty">This party has ended.</p>;

	if (!session) return <JoinGate onJoin={(name) => party.join(name)} />;

	const members = orderMembers(view.members, session.memberId);

	return (
		<main className="v2party">
			<h1 className="v2party__title">
				The room is <em>live</em>
			</h1>

			<div className="v2party__grid">
				<div className="v2party__stack">
					<section className="v2party__panel v2party__reactzone">
						{current ? (
							<>
								<h2 className="v2party__now-title">{current.title}</h2>
								<p className="v2party__now-artist">{current.artist}</p>
							</>
						) : (
							<h2 className="v2party__now-title">Queue something ↓</h2>
						)}
						<div className="v2party__video" ref={mountRef} />

						{isHost && (
							<div className="v2party__hostbar">
								<button
									type="button"
									className="v2party__ctl"
									disabled={!current}
									onClick={() =>
										party.control({
											op: view.playback.playing ? "pause" : "play",
										})
									}
								>
									{view.playback.playing ? "Pause all" : "Play all"}
								</button>
								<button
									type="button"
									className="v2party__ctl"
									data-quiet
									disabled={view.currentIndex + 1 >= view.queue.length}
									onClick={() =>
										party.control({
											op: "select",
											index: view.currentIndex + 1,
										})
									}
								>
									Skip →
								</button>
							</div>
						)}

						{/* Reaction pops: keyed by sender+time so each burst animates
						    once and unmounts when the server prunes it. */}
						<div className="v2party__pops" aria-hidden="true">
							{view.reactions.map((reaction, index) => (
								<span
									key={`${reaction.memberId}:${reaction.at}`}
									className="v2party__pop"
									style={{ insetInlineStart: `${(index * 13 + 8) % 85}%` }}
								>
									{reaction.emoji}
									<span className="v2party__pop-name">{reaction.name}</span>
								</span>
							))}
						</div>
						<div className="v2party__reactbar">
							{REACTIONS.map((emoji) => (
								<button
									key={emoji}
									type="button"
									className="v2party__react"
									aria-label={`React ${emoji}`}
									onClick={() => party.react(emoji).catch(() => undefined)}
								>
									{emoji}
								</button>
							))}
						</div>
					</section>

					<section className="v2party__panel">
						<h2 className="v2party__chat-title">Who's here</h2>
						{/* One atomic status, not a chorus of live regions. */}
						<output
							className="v2party__hint"
							aria-atomic="true"
							style={{ display: "block" }}
						>
							{members.length === 1
								? "Just you so far — send the code!"
								: `${members.length} in the room`}
						</output>
						<div className="v2party__members">
							{members.map((member, index) => (
								<span
									key={member.id}
									className="v2party__avatar"
									data-tint={(index % 4) + 1}
									data-host={member.host || undefined}
									title={`${member.name}${member.host ? " · host" : ""}`}
								>
									{member.name.slice(0, 1).toUpperCase()}
								</span>
							))}
						</div>
						<p className="v2party__hint" style={{ marginTop: "0.75rem" }}>
							Room code: <span className="v2party__code">{roomId}</span>
						</p>
					</section>

					<Queue party={party} />
				</div>

				<Chat party={party} selfId={session.memberId} />
			</div>
		</main>
	);
}

function JoinGate({ onJoin }: { onJoin: (name: string) => Promise<void> }) {
	const [name, setName] = useState(() =>
		typeof window === "undefined" ? "" : readStoredName(),
	);
	const [error, setError] = useState<string | null>(null);
	return (
		<main className="v2party">
			<h1 className="v2party__title">
				You're <em>invited</em>
			</h1>
			<section className="v2party__panel" style={{ maxWidth: "26rem" }}>
				<form
					className="v2party__form"
					onSubmit={(event) => {
						event.preventDefault();
						if (!name.trim()) return;
						onJoin(name.trim()).catch((cause) =>
							setError(
								cause instanceof Error ? cause.message : "Could not join",
							),
						);
					}}
				>
					<input
						className="v2party__field"
						value={name}
						maxLength={24}
						placeholder="Your name at the party"
						aria-label="Your name"
						onChange={(event) => setName(event.target.value)}
					/>
					<button
						type="submit"
						className="v2party__ctl"
						disabled={!name.trim()}
					>
						Jump in
					</button>
					{error && <p className="v2party__hint">{error}</p>}
				</form>
			</section>
		</main>
	);
}

function Queue({ party }: { party: ReturnType<typeof usePartyRoom> }) {
	const { view } = party;
	const [query, setQuery] = useState("");
	const [debounced, setDebounced] = useState("");
	const [results, setResults] = useState<TrackSummary[]>([]);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(query.trim()), 250);
		return () => clearTimeout(timer);
	}, [query]);

	useEffect(() => {
		if (debounced.length < 2) {
			setResults([]);
			return;
		}
		const controller = new AbortController();
		fetch(`/api/search?q=${encodeURIComponent(debounced)}`, {
			signal: controller.signal,
		})
			.then((response) => (response.ok ? response.json() : []))
			.then((found: TrackSummary[]) => setResults(found.slice(0, 5)))
			.catch(() => undefined);
		return () => controller.abort();
	}, [debounced]);

	if (!view) return null;

	return (
		<section className="v2party__panel">
			<h2 className="v2party__chat-title">Queue</h2>
			<div className="v2party__queue">
				{view.queue.map((track, index) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: the same song can be queued twice; slot identity IS the position
						key={`${track.id}:${index}`}
						className="v2party__qrow"
						data-current={index === view.currentIndex || undefined}
					>
						{track.title} — {track.artist}
						<span className="v2party__qmeta">by {track.addedBy}</span>
					</div>
				))}
				{view.queue.length === 0 && (
					<p className="v2party__hint">Nothing queued yet — you first.</p>
				)}
			</div>
			<form
				className="v2party__chat-form"
				onSubmit={(event) => event.preventDefault()}
			>
				<input
					className="v2party__chat-input"
					type="search"
					value={query}
					placeholder="Add a song…"
					aria-label="Search songs to add"
					onChange={(event) => setQuery(event.target.value)}
				/>
			</form>
			{results.length > 0 && (
				<div className="v2party__queue" style={{ marginTop: "0.5rem" }}>
					{results.map((track) => (
						<div key={track.id} className="v2party__qrow">
							{track.title} — {track.artist}
							<button
								type="button"
								className="v2party__react"
								style={{ marginInlineStart: "auto" }}
								onClick={() =>
									party
										.add(track)
										.then(() => {
											setQuery("");
											setResults([]);
										})
										.catch(() => undefined)
								}
							>
								＋
							</button>
						</div>
					))}
				</div>
			)}
		</section>
	);
}

function Chat({
	party,
	selfId,
}: {
	party: ReturnType<typeof usePartyRoom>;
	selfId: string;
}) {
	const { view } = party;
	const [text, setText] = useState("");
	const endRef = useRef<HTMLDivElement>(null);
	const count = view?.messages.length ?? 0;

	// biome-ignore lint/correctness/useExhaustiveDependencies: new messages ARE the scroll schedule
	useEffect(() => {
		endRef.current?.scrollIntoView({ block: "nearest" });
	}, [count]);

	if (!view) return null;

	return (
		<section className="v2party__panel v2party__chat">
			<h2 className="v2party__chat-title">Side chat</h2>
			<div className="v2party__msgs" role="log" aria-label="Party chat">
				{view.messages.map((message) => (
					<p key={`${message.memberId}:${message.at}`} className="v2party__msg">
						<b>{message.memberId === selfId ? "you" : message.name}</b>{" "}
						{message.text}
					</p>
				))}
				{view.messages.length === 0 && (
					<p className="v2party__hint">Say something — the room can hear.</p>
				)}
				<div ref={endRef} />
			</div>
			<form
				className="v2party__chat-form"
				onSubmit={(event) => {
					event.preventDefault();
					const trimmed = text.trim();
					if (!trimmed) return;
					setText("");
					party.chat(trimmed).catch(() => setText(trimmed));
				}}
			>
				<input
					className="v2party__chat-input"
					value={text}
					maxLength={280}
					placeholder="Type it…"
					aria-label="Chat message"
					onChange={(event) => setText(event.target.value)}
				/>
				<button type="submit" className="v2party__ctl" data-quiet>
					Send
				</button>
			</form>
		</section>
	);
}
