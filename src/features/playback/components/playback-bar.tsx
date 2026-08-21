import { motion } from "motion/react";
import { useEffect, useRef } from "react";

import { type LinePosition, linePositionAt } from "@/lib/lrc";
import { riseVariants, transition } from "@/lib/motion";
import type { Stanza } from "@/lib/types";

import { useManualOverride } from "../hooks/use-manual-override";
import { useYouTubePlayer } from "../hooks/use-youtube-player";
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
	stanzas,
	synced,
	onSyncChange,
}: {
	videoId: string;
	title: string;
	stanzas: Stanza[];
	/** Without timestamps there is nothing to sync to — audio still plays. */
	synced: boolean;
	onSyncChange: (position: LinePosition | null) => void;
}) {
	const mountRef = useRef<HTMLDivElement>(null);
	const { ready, playing, currentTime, toggle } = useYouTubePlayer(
		videoId,
		mountRef,
	);

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

	useEffect(() => {
		onSyncChange(latest.current);
	}, [reportedKey, onSyncChange]);

	const status = !ready
		? "Loading"
		: !playing
			? "Paused"
			: !synced
				? "No timings"
				: manual
					? "Manual scroll"
					: "Following";

	return (
		<motion.div
			className="playback"
			variants={riseVariants}
			initial="hidden"
			animate="visible"
			transition={transition.editorial}
		>
			{/*
			  Visible by requirement. YouTube's policies forbid a background
			  player and forbid isolating the audio, so this is composed into
			  the page rather than hidden (D-022).
			*/}
			<div className="playback__video">
				<div ref={mountRef} />
			</div>

			<button
				type="button"
				onClick={toggle}
				disabled={!ready}
				aria-label={playing ? "Pause" : "Play"}
				className="flex-none rounded-full border border-hairline px-4 py-2 font-ui text-caption text-ink disabled:opacity-50"
			>
				{playing ? "Pause" : "Play"}
			</button>

			<span className="playback__meta">
				<span className="playback__title text-caption text-ink">{title}</span>
				<span className="playback__status text-micro">{status}</span>
			</span>

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
	);
}
