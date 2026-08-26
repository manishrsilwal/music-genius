import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { SearchField } from "@/features/discovery/components/search-field";
import { useManualOverride } from "@/features/playback/hooks/use-manual-override";
import { useYouTubePlayer } from "@/features/playback/hooks/use-youtube-player";
import { LyricCanvas } from "@/features/scrollytelling/components/lyric-canvas";
// For the Sync pill and its wave — the same control, the same anatomy, as
// the track page's bar (D-115, amended: continuity over invention).
import "@/features/playback/components/playback-bar.scss";
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

	/*
	 * One tab plays per member (D-117). The same room open twice in one
	 * browser meant two players following the same clock — the song in
	 * unintentional stereo. Tabs talk over a BroadcastChannel: the newest
	 * claim wins, older tabs stand their player down, and "Play here
	 * instead" reclaims. Membership and polling are untouched — a superseded
	 * tab still shows the room; it just does not sound.
	 */
	const [superseded, setSuperseded] = useState(false);
	const tabId = useRef(Math.random().toString(36).slice(2));
	const channelRef = useRef<BroadcastChannel | null>(null);
	useEffect(() => {
		if (!session || typeof BroadcastChannel === "undefined") return;
		const channel = new BroadcastChannel(`tle:party-tab:${roomId}`);
		channelRef.current = channel;
		channel.onmessage = (event) => {
			const data = event.data as { type?: string; tab?: string };
			if (data?.type === "claim" && data.tab !== tabId.current) {
				setSuperseded(true);
			}
		};
		channel.postMessage({ type: "claim", tab: tabId.current });
		return () => {
			channelRef.current = null;
			channel.close();
		};
	}, [session, roomId]);

	const takeOver = () => {
		channelRef.current?.postMessage({ type: "claim", tab: tabId.current });
		setSuperseded(false);
	};

	const mountRef = useRef<HTMLDivElement>(null);
	const player = useYouTubePlayer(
		superseded ? null : (current?.videoId ?? null),
		mountRef,
	);
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
	 * The reader taking the wheel back (D-115, amended on the owner's
	 * report): scrolling up to reach the queue was yanked straight back to
	 * the synced verse, because the canvas followed the party clock
	 * unconditionally. The same override the track page uses: a wheel, a
	 * touch or a scroll key means the reader is driving, and the Sync pill —
	 * the same pill, the same wave — is the way back to following.
	 */
	const partyPlaying = Boolean(view?.playback.playing);
	const [wantSync, setWantSync] = useState(true);
	const syncing = partyPlaying && wantSync;
	const { manual, resume } = useManualOverride(syncing);
	const followOn = syncing && !manual;
	const toggleSync = () => {
		if (followOn) {
			setWantSync(false);
		} else {
			setWantSync(true);
			resume();
		}
	};

	/*
	 * The follower — every member runs it, host included, so there is exactly
	 * one behaviour to reason about. Play state is matched first; position is
	 * corrected only past the tolerance, because a player that twitches every
	 * poll is worse company than one a second adrift.
	 *
	 * `tick` drives it instead of a deps-of-everything list: following is a
	 * repeated comparison, not a reaction to any single change.
	 */
	// `view` is a dependency alongside the tick (D-115, amended): a hidden
	// tab's timers are throttled, so the host's pause must apply on the poll
	// that CARRIES it, not wait for the next local tick.
	// biome-ignore lint/correctness/useExhaustiveDependencies: tick and view ARE the schedule
	useEffect(() => {
		if (superseded || !view || !current) return;
		const p = playerRef.current;
		if (!p.ready) return;

		if (view.playback.playing !== p.playing) {
			// One nudge per pass. If the browser refuses (autoplay policy),
			// the "Catch up" button below is the reader's gesture.
			p.toggle();
		}
		if (
			view.playback.playing &&
			Math.abs(p.currentTime - position) > SEEK_TOLERANCE_S
		) {
			p.seek(position);
		}
	}, [tick, view]);

	/*
	 * End of track — EVERY member's duty now (D-117). Host-only advancing
	 * stalled the party the moment the host pocketed their phone: the song
	 * ended and nothing could move the queue. Democratising it is safe
	 * because the server's advance is conditional on `from` (D-116) — five
	 * punctual clients resolve to one advance and four free no-ops. The
	 * recorded duration is the reference; three-quarters of a second early
	 * beats YouTube's own end screen.
	 */
	const advancedFrom = useRef(-1);
	// biome-ignore lint/correctness/useExhaustiveDependencies: tick IS the schedule
	useEffect(() => {
		if (superseded || !view || !current?.duration) return;
		if (!view.playback.playing) return;
		if (position < current.duration - 0.75) return;
		if (advancedFrom.current === view.currentIndex) return;

		advancedFrom.current = view.currentIndex;
		party.advance(view.currentIndex).catch(() => {
			// Let the next tick retry rather than strand the queue.
			advancedFrom.current = -1;
		});
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
	// The canvas follows only while the reader has not taken the wheel —
	// null hands the scroll back to them, exactly as on the track page.
	const syncPosition =
		track?.synced && followOn ? linePositionAt(track.stanzas, position) : null;

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
				<h1 className="party__title text-ink">{party.gone}</h1>
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
				<h1 className="party__title mt-3 text-ink">
					Join the listen <em className="party__title-fancy">party</em>
				</h1>
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
						{isHost ? "Your listen party" : "A listen party"}
					</p>
					<h1 className="party__title mt-2 text-ink">
						Listening <em className="party__title-fancy">together</em>
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

						{/* Visible by requirement (D-036) — every member's own player.
						    Always in the tree (D-054); a superseded tab's hook gets a
						    null id, so the box empties and `:empty` hides it. */}
						<div ref={mountRef} className="party__video" />

						{superseded && (
							<>
								<output className="text-micro text-ink-faint">
									This party is playing in another tab.
								</output>
								<button
									type="button"
									className="party__share text-micro"
									onClick={takeOver}
								>
									Play here instead
								</button>
							</>
						)}

						{/*
						  The same Sync pill as the track page (D-085), because it
						  is the same promise: pressed and waving while the canvas
						  follows the song, flat once the reader scrolls off on
						  their own — and the way back when they do.
						*/}
						{!superseded && track?.synced && (
							<button
								type="button"
								onClick={toggleSync}
								aria-pressed={followOn}
								className="playback__sync px-3 py-1.5 text-micro"
							>
								<span className="playback__sync-wave" aria-hidden="true">
									<span />
									<span />
									<span />
								</span>
								Sync
							</button>
						)}

						{superseded ? null : isHost ? (
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
