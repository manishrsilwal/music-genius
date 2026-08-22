import { motion } from "motion/react";
import { useEffect, useRef } from "react";

import { type LinePosition, linePositionAt } from "@/lib/lrc";
import { riseVariants, transition } from "@/lib/motion";
import type { Stanza } from "@/lib/types";

import { useDocked } from "../hooks/use-docked";
import { useManualOverride } from "../hooks/use-manual-override";
import { useYouTubePlayer } from "../hooks/use-youtube-player";
import { PauseIcon, PlayIcon } from "./player-icons";
import { formatTime, Seekbar } from "./seekbar";
import "./playback-bar.scss";

/**
 * Playback and the sync clock (PRD §3.2).
 *
 * Reports the stanza the song is currently on so the canvas can follow. Sync
 * stops the moment the reader scrolls for themselves, and can be resumed.
 */
export function PlaybackBar({
	videoId,
	title,
	artist,
	artwork,
	stanzas,
	synced,
	onSyncChange,
}: {
	videoId: string;
	title: string;
	artist: string;
	/** Null until the Genius lookup streams in, or if it found nothing. */
	artwork: string | null;
	stanzas: Stanza[];
	/** Without timestamps there is nothing to sync to — audio still plays. */
	synced: boolean;
	onSyncChange: (position: LinePosition | null) => void;
}) {
	const mountRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const docked = useDocked(sentinelRef);
	const {
		status,
		ready,
		reason,
		playing,
		currentTime,
		duration,
		toggle,
		seek,
	} = useYouTubePlayer(videoId, mountRef);
	const unavailable = status === "unavailable";

	const syncing = synced && playing;
	const { manual, resume } = useManualOverride(syncing);

	// Derived, then pushed up. Recomputed each poll tick; linePositionAt is a
	// backwards scan over a few dozen entries, so this is cheap.
	const position =
		syncing && !manual ? linePositionAt(stanzas, currentTime) : null;

	// The parent only cares when the line changes, so compare on the key rather
	// than the object — a fresh object every tick would re-fire the effect.
	const reportedKey = position?.key ?? null;

	// Reported from an effect, never during render. React state must not be
	// pushed to a parent mid-render, and the effect also gives us the
	// change-only behaviour for free.
	const latest = useRef<LinePosition | null>(null);
	latest.current = position;

	// The effect reads `latest.current`, a ref, so `reportedKey` is a trigger
	// rather than a read. It is what gives the effect its change-only
	// behaviour; removing it would report once and then go silent.
	// biome-ignore lint/correctness/useExhaustiveDependencies: trigger, not a read
	useEffect(() => {
		onSyncChange(latest.current);
	}, [reportedKey, onSyncChange]);

	// Only states the reader cannot already see. "Paused" duplicated the Play
	// button sitting beside it, and "Following" restated the obvious while the
	// canvas was visibly following; both crowded out the artist, which is what
	// a now-playing line is actually for (D-036).
	// "Loading" is only honest while something is still happening. When
	// playback has actually failed, say what failed — a spinner that never
	// resolves is the one state that tells the reader nothing at all (D-054).
	const notice = unavailable
		? (reason ?? "Playback unavailable")
		: !ready
			? "Loading"
			: playing && !synced
				? "No timings"
				: playing && manual
					? "Manual scroll"
					: null;

	return (
		<div className="playback-slot">
			{/*
			  Stays in flow whatever the player does, so the dock threshold
			  cannot oscillate. Also reserves the player's height, so docking
			  does not collapse the hero and shift the page under the reader.
			*/}
			<div ref={sentinelRef} className="playback-slot__sentinel" />

			<motion.div
				className="playback"
				data-docked={docked || undefined}
				variants={riseVariants}
				initial="hidden"
				animate="visible"
				transition={transition.editorial}
			>
				{/* Full-bleed across the top edge when docked (D-040). */}
				{docked && !unavailable && (
					<Seekbar
						currentTime={currentTime}
						duration={duration}
						disabled={!ready}
						onSeek={seek}
					/>
				)}

				{/*
			  The record. Spins while the song plays and holds where it stopped
			  when paused — the state is readable before the label is (D-036).
			  Decorative: the title beside it already names the track.
			*/}
				<div className="playback__record" data-spinning={playing || undefined}>
					{artwork ? (
						<img src={artwork} alt="" className="playback__art" />
					) : (
						<span className="playback__art playback__art--empty" />
					)}
					<span className="playback__spindle" />
				</div>

				{!unavailable && (
					<button
						type="button"
						onClick={toggle}
						disabled={!ready}
						aria-label={playing ? "Pause" : "Play"}
						className="playback__toggle"
					>
						{playing ? <PauseIcon /> : <PlayIcon />}
					</button>
				)}

				{/* Times are read from the seekbar's aria-valuetext, so these are
				    decoration for the eye only. */}
				{docked && (
					<span className="playback__time" aria-hidden="true">
						{formatTime(currentTime)}
					</span>
				)}

				<span className="playback__meta">
					<span className="playback__title text-caption text-ink">{title}</span>
					<span
						className="playback__status text-micro"
						data-notice={notice ? "" : undefined}
					>
						{notice ?? artist}
					</span>
				</span>

				{docked && (
					<span className="playback__time" aria-hidden="true">
						{formatTime(duration)}
					</span>
				)}

				{/*
			  Visible by requirement, not by preference. YouTube's policies
			  forbid "a player that is not displayed in the page, tab, or screen
			  that the user is viewing" (III.I.9) and forbid isolating the audio
			  from the video (III.I.7). No minimum size is specified, so the
			  record leads and the player is quiet — but it is genuinely on
			  screen, never clipped, faded or covered (D-036).
			*/}
				{/*
				  Once playback has failed there is no player to display, so the
				  policy that requires it visible (D-036) no longer applies —
				  and an empty black rectangle is worse than nothing: it reads
				  as a broken image rather than as an absent feature. The link
				  replaces it, because the reader came here for this song and
				  YouTube will still play it on its own site.
				*/}
				{/*
				  Always mounted, never conditional. Unmounting this while the
				  API's iframe is inside it would put React and YouTube back to
				  fighting over the same node — the bug this whole path exists
				  to avoid (D-054). The hook empties it on failure and
				  `:empty` hides it, so a dead player leaves no black box
				  behind rather than a broken-looking rectangle.

				  The ref is on the container itself: the hook creates and
				  destroys the node inside it, so React must not render one.
				*/}
				<div ref={mountRef} className="playback__video" />

				{unavailable && videoId && (
					<a
						href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`}
						target="_blank"
						rel="noopener noreferrer"
						className="playback__elsewhere text-micro"
					>
						Watch on YouTube
					</a>
				)}

				{manual && syncing && (
					<button
						type="button"
						onClick={resume}
						className="playback__resume px-3 py-1.5 text-micro"
					>
						Resync
					</button>
				)}
			</motion.div>
		</div>
	);
}
