import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { SearchField } from "@/features/discovery/components/search-field";
import { useYouTubePlayer } from "@/features/playback/hooks/use-youtube-player";
import { LyricCanvas } from "@/features/scrollytelling/components/lyric-canvas";
import { linePositionAt } from "@/lib/lrc";
import { positionAt } from "@/lib/party";
import type { Track, TrackSummary } from "@/lib/types";
import { readStoredName, usePartyRoom } from "../hooks/use-party";
import "./party.scss";

/**
 * The listen party room (D-115).
 *
 * One truth, many players: the room state is the claim, every member's
 * visible YouTube player follows it, and the host's controls are the only
 * hands on the transport. The lyrics canvas follows the same clock, so the
 * party reads together as it listens together.
 */

/** Fixing a drift bigger than this reads as correction, not as jitter. */
const SEEK_TOLERANCE_S = 3;

/** How often the local clock re-derives position, sync line, and end-of-track. */
const TICK_MS = 500;

function formatClock(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}

export function PartyRoom({ roomId }: { roomId: string }) {
	const party = usePartyRoom(roomId);
	const { view, session, isHost, now } = party;

	const [name, setName] = useState("");
	const [joinError, setJoinError] = useState<string | null>(null);
	const [addNotice, setAddNotice] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		setName(readStoredName());
	}, []);

	const current = view ? (view.queue[view.currentIndex] ?? null) : null;

	const mountRef = useRef<HTMLDivElement>(null);
	const player = useYouTubePlayer(current?.videoId ?? null, mountRef);
	const playerRef = useRef(player);
	playerRef.current = player;

	// The local clock: re-derives the party position twice a second. State so
	// the sync line and times re-render; everything else reads it directly.
	const [tick, setTick] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setTick((t) => t + 1), TICK_MS);
		return () => clearInterval(timer);
	}, []);

	const position =
		view && current ? positionAt(view.playback, now(), current.duration) : 0;

	/*
	 * The follower — every member runs it, host included, so there is exactly
	 * one behaviour to reason about. Play state is matched first; position is
	 * corrected only past the tolerance, because a player that twitches every
	 * poll is worse company than one a second adrift.
	 *
	 * `tick` drives it instead of a deps-of-everything list: following is a
	 * repeated comparison, not a reaction to any single change.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: tick IS the schedule
	useEffect(() => {
		if (!view || !current) return;
		const p = playerRef.current;
		if (!p.ready) return;

		if (view.playback.playing !== p.playing) {
			// One nudge per tick. If the browser refuses (autoplay policy),
			// the "Catch up" button below is the reader's gesture.
			p.toggle();
		}
		if (
			view.playback.playing &&
			Math.abs(p.currentTime - position) > SEEK_TOLERANCE_S
		) {
			p.seek(position);
		}
	}, [tick]);

	/*
	 * End of track — the HOST's duty alone, or every member would race to
	 * advance the queue. The party's recorded duration is the reference;
	 * three-quarters of a second early beats YouTube's own end screen.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: tick IS the schedule
	useEffect(() => {
		if (!isHost || !view || !current?.duration) return;
		if (!view.playback.playing) return;
		if (position < current.duration - 0.75) return;

		const nextIndex = view.currentIndex + 1;
		if (nextIndex < view.queue.length) {
			party.control({ op: "select", index: nextIndex });
		} else {
			party.control({ op: "pause" });
		}
	}, [tick]);

	// The words, reading along with the room (D-115). Same canvas, same
	// LinePosition contract as the track page — the party clock stands where
	// the local player's clock would.
	const trackQuery = useQuery({
		queryKey: ["party-track", current?.id],
		queryFn: async ({ signal }): Promise<Track> => {
			const response = await fetch(
				`/api/track?id=${encodeURIComponent(current?.id ?? "")}`,
				{ signal },
			);
			if (!response.ok) throw new Error("Lyrics unavailable");
			return response.json();
		},
		enabled: Boolean(current),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const track = trackQuery.data ?? null;
	const syncPosition =
		track?.synced && view?.playback.playing
			? linePositionAt(track.stanzas, position)
			: null;

	const share = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard refused — the URL bar is right there.
		}
	};

	const addTrack = async (summary: TrackSummary) => {
		// Resolving the recording takes seconds on a novel song (the Genius
		// media lookup, D-055) — measured ~4s. Silence that long after a click
		// reads as a swallowed add, so the wait says its name.
		setAddNotice(`Adding “${summary.title}”…`);
		try {
			await party.add(summary);
			setAddNotice(null);
		} catch (error) {
			setAddNotice(error instanceof Error ? error.message : "Could not add it");
		}
	};

	/* ------------------------------------------------------------------ */

	if (party.gone) {
		return (
			<main className="party party--gone">
				<h1 className="text-display">{party.gone}</h1>
				<p className="mt-4 text-caption text-ink-muted">
					Parties end after a day of quiet. Start a new one and share the fresh
					link.
				</p>
				<a href="/party" className="party__cta mt-8">
					Start a party
				</a>
			</main>
		);
	}

	if (view === undefined || session === undefined) {
		return (
			<main className="party party--gone">
				<p className="text-caption text-ink-faint">Finding the party…</p>
			</main>
		);
	}

	// Not a member yet: the door. The join click doubles as the browser
	// gesture that lets the player start with sound.
	if (!session) {
		return (
			<main className="party party--door">
				<p className="text-micro uppercase tracking-label text-ink-faint">
					You are invited
				</p>
				<h1 className="mt-3 text-display">Join the listen party</h1>
				{view && view.members.length > 0 && (
					<p className="mt-3 text-caption text-ink-muted">
						{view.members.map((m) => m.name).join(", ")}{" "}
						{view.members.length === 1 ? "is" : "are"} already here.
					</p>
				)}
				<form
					className="party__join mt-8"
					onSubmit={async (event) => {
						event.preventDefault();
						setJoinError(null);
						try {
							await party.join(name);
						} catch (error) {
							setJoinError(
								error instanceof Error ? error.message : "Could not join",
							);
						}
					}}
				>
					<label
						htmlFor="party-name"
						className="mb-2 block text-micro uppercase tracking-label text-ink-faint"
					>
						Your name at the party
					</label>
					<input
						id="party-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						maxLength={24}
						required
						className="party__name-input px-5 py-4 text-lead"
					/>
					<button type="submit" className="party__cta mt-5">
						Join the party
					</button>
					{joinError && (
						<p className="mt-3 text-micro text-ink-faint">{joinError}</p>
					)}
				</form>
			</main>
		);
	}

	return (
		<main className="party">
			<header className="party__head">
				<div>
					<p className="text-micro uppercase tracking-label text-ink-faint">
						Listen party
					</p>
					<h1 className="mt-1 text-display">
						{isHost ? "Your room" : "The room"}
					</h1>
				</div>
				<button
					type="button"
					onClick={share}
					className="party__share text-micro"
				>
					{copied ? "Link copied" : "Copy invite link"}
				</button>
			</header>

			<ul className="party__members" aria-label="At the party">
				{view?.members.map((member) => (
					<li key={member.id} className="party__member text-micro">
						{member.name}
						{member.host ? " · host" : ""}
					</li>
				))}
			</ul>

			<section className="party__now" aria-label="Now playing">
				{current ? (
					<>
						<div className="party__now-meta">
							<p className="party__now-title text-lead text-ink">
								{current.title}
							</p>
							<p className="text-caption text-ink-muted">
								{current.artist} · added by {current.addedBy}
							</p>
							<p className="mt-1 text-micro text-ink-faint" aria-hidden="true">
								{formatClock(position)}
								{current.duration ? ` / ${formatClock(current.duration)}` : ""}
							</p>
						</div>

						{/* Visible by requirement (D-036) — every member's own player. */}
						<div ref={mountRef} className="party__video" />

						{isHost ? (
							<div className="party__transport">
								<button
									type="button"
									className="party__cta"
									onClick={() =>
										party.control({
											op: view?.playback.playing ? "pause" : "play",
										})
									}
								>
									{view?.playback.playing ? "Pause for everyone" : "Play"}
								</button>
								{view && view.currentIndex + 1 < view.queue.length && (
									<button
										type="button"
										className="party__share text-micro"
										onClick={() =>
											party.control({
												op: "select",
												index: view.currentIndex + 1,
											})
										}
									>
										Next song
									</button>
								)}
							</div>
						) : (
							view?.playback.playing &&
							player.ready &&
							!player.playing && (
								<button
									type="button"
									className="party__cta"
									onClick={() => {
										player.toggle();
										player.seek(position);
									}}
								>
									Catch up with the party
								</button>
							)
						)}
					</>
				) : (
					<p className="text-caption text-ink-muted">
						Queue the first song and the party starts on its own.
					</p>
				)}
			</section>

			<section className="party__queue" aria-label="The queue">
				<h2 className="text-caption uppercase tracking-label text-ink-faint">
					Build the queue
				</h2>
				<div className="mt-3">
					<SearchField hideLabel onSelect={addTrack} />
				</div>
				{/* <output> carries the status role natively — the SearchField's
				    own idiom (D-053): a refused add must be announced, not just
				    printed, since nothing moves focus to it. */}
				{addNotice && (
					<output className="mt-2 block text-micro text-ink-faint">
						{addNotice}
					</output>
				)}

				{view && view.queue.length > 0 && (
					<ol className="party__list mt-5">
						{view.queue.map((entry, index) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: the queue is append-only in Phase 1 — no reorder, no removal — so a row's position IS its identity, and the same song may legitimately appear twice
								key={`${entry.id}-${index}`}
								className="party__row"
								data-current={index === view.currentIndex || undefined}
							>
								{isHost ? (
									<button
										type="button"
										className="party__row-btn"
										onClick={() => party.control({ op: "select", index })}
									>
										<span className="text-caption text-ink">{entry.title}</span>
										<span className="text-micro text-ink-faint">
											{entry.artist} · {entry.addedBy}
										</span>
									</button>
								) : (
									<span className="party__row-btn">
										<span className="text-caption text-ink">{entry.title}</span>
										<span className="text-micro text-ink-faint">
											{entry.artist} · {entry.addedBy}
										</span>
									</span>
								)}
							</li>
						))}
					</ol>
				)}
			</section>

			{track && track.stanzas.length > 0 && (
				<section className="party__lyrics" aria-label="The words">
					<LyricCanvas stanzas={track.stanzas} syncPosition={syncPosition} />
				</section>
			)}
		</main>
	);
}
