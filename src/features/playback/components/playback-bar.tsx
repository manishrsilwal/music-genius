import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { type LinePosition, linePositionAt, timingsDrift } from "@/lib/lrc";
import { riseVariants, transition } from "@/lib/motion";
import type { Stanza } from "@/lib/types";

import { useDocked } from "../hooks/use-docked";
import { useManualOverride } from "../hooks/use-manual-override";
import { resolvePlayer, usePlaybackSource } from "../hooks/use-playback-source";
import {
	looksLikePreview,
	useSpotifyPlayer,
} from "../hooks/use-spotify-player";
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
	spotifyId,
	resolving,
	title,
	artist,
	stanzas,
	synced,
	lyricsDuration,
	onSyncChange,
	onPlayingChange,
	jumpTo,
	onReadyChange,
	onSyncEngaged,
}: {
	/** Null while the lookup is still running, and null if it found nothing. */
	videoId: string | null;
	/**
	 * The Spotify track id, for the reader who chose the embed (D-112). Null
	 * on the same terms as `videoId`; when only this is null the bar borrows
	 * YouTube rather than going silent.
	 */
	spotifyId: string | null;
	/**
	 * Which of those two a null `videoId` means. Without it the bar cannot tell
	 * "still looking" from "looked, and there is no recording" — and would have
	 * to show the same message for a wait that ends and one that never does.
	 */
	resolving: boolean;
	title: string;
	artist: string;
	stanzas: Stanza[];
	/** Without timestamps there is nothing to sync to — audio still plays. */
	synced: boolean;
	/**
	 * The duration the LRC timings were cut against, from LRCLIB (D-075).
	 * Compared with what the player actually loads: Genius usually links the
	 * official video, whose cinematic intro puts every line tens of seconds
	 * from the voice. Null when LRCLIB did not record one.
	 */
	lyricsDuration: number | null;
	onSyncChange: (position: LinePosition | null) => void;
	/**
	 * Play state, reported upward so the hero's cover can spin (D-080). The
	 * record left the bar — the page's one artwork carries the play state now,
	 * instead of a second copy of the same image announcing it in miniature.
	 */
	onPlayingChange?: (playing: boolean) => void;
	/**
	 * A page-issued seek (D-134): clicking a lyric line plays the song from
	 * that line's timestamp. The nonce distinguishes two clicks on the same
	 * line — same seconds, new request. Honoured when a player is ready;
	 * starts playback if it was paused, the way a tap on Spotify's lyric
	 * view does.
	 */
	jumpTo?: { seconds: number; nonce: number } | null;
	/**
	 * Whether the ACTIVE player can take commands right now (D-134, second
	 * round): the page withholds the tap-to-play affordance until this says
	 * so — a line that looks clickable while the player is still loading
	 * is a promise the tap silently breaks. Tracks the chosen source:
	 * switching players reports false again until the new one stands up.
	 */
	onReadyChange?: (ready: boolean) => void;
	/**
	 * Fired when the reader RE-ENGAGES sync (the Sync button turning
	 * following back on) — the page scrolls to the current line at once
	 * instead of waiting for the next line change (D-136 follow-up).
	 */
	onSyncEngaged?: () => void;
}) {
	const mountRef = useRef<HTMLDivElement>(null);
	const spotifyMountRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const docked = useDocked(sentinelRef);

	/*
	 * Which player this reader listens through (D-112). Undecided — first
	 * visit, or storage still being read — means the question renders where
	 * the transport would, and NEITHER player is created: passing null ids
	 * keeps both hooks dormant, and flipping the real id in after the answer
	 * re-runs their effects against a mount node that exists by then.
	 */
	const { choice, choose } = usePlaybackSource();
	const asking = choice === null;
	const deciding = choice == null;
	const { source, borrowed } = resolvePlayer(choice, spotifyId, videoId);
	const youtube = useYouTubePlayer(
		!deciding && source === "youtube" ? videoId : null,
		mountRef,
	);
	const spotifyPlayer = useSpotifyPlayer(
		!deciding && source === "spotify" ? spotifyId : null,
		spotifyMountRef,
	);
	const {
		status,
		ready,
		reason,
		playing,
		currentTime,
		duration,
		toggle,
		seek,
	} = source === "spotify" ? spotifyPlayer : youtube;

	// Three ways there is no player, and the reader is owed a different
	// sentence for each (D-055).
	const activeId = source === "spotify" ? spotifyId : videoId;
	const searching = resolving && !activeId;
	const noRecording = !resolving && !activeId;
	const unavailable = status === "unavailable" || noRecording;

	/*
	 * The signed-out Spotify preview, confessed by its own clock (D-114). It
	 * must be told apart from drift below: a 30-second duration against
	 * three-minute timings is not "another cut", it is the same cut with the
	 * tap turned off early — the clock is right for as long as it runs, so
	 * sync stays on and the notice says how to get the rest of the song.
	 */
	const preview =
		source === "spotify" && looksLikePreview(duration, lyricsDuration);

	// The linked upload is a different cut from the one the timings were made
	// for (D-075). Sync is withheld rather than run wrong: a canvas scrolling
	// to lines tens of seconds from the voice is worse than one that says why
	// it stopped following. Detection only — shifting the timestamps by the
	// difference would assume all the extra time is intro, which an official
	// video does not promise.
	const drifted = synced && !preview && timingsDrift(duration, lyricsDuration);

	/*
	 * Whether the reader WANTS the canvas following the song (D-080).
	 *
	 * Null means they have not said, and the default answers for them: on,
	 * unless the timings belong to a different cut (D-075) — in which case
	 * sync starts off and the notice says why. The button below lets them
	 * overrule either way, which D-075 never offered: drift used to withhold
	 * sync with no recourse, and the "Resync" pill required `manual && syncing`
	 * — a pair that drift made permanently false, so the one control that
	 * could have helped could never render.
	 */
	const [wantSync, setWantSync] = useState<boolean | null>(null);
	const desire = wantSync ?? !drifted;

	// The active player's readiness, reported upward (D-134 second round)
	// so the page only offers tap-to-play once a tap would actually land.
	useEffect(() => {
		onReadyChange?.(ready && !unavailable);
	}, [ready, unavailable, onReadyChange]);

	const syncing = synced && playing && desire;
	const { manual, resume } = useManualOverride(syncing);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the nonce IS the request; the rest is read at fire time
	useEffect(() => {
		if (!jumpTo || !ready) return;
		seek(jumpTo.seconds);
		if (!playing) toggle();
		// A line tap is an explicit "follow from HERE" (D-134 third round):
		// it rejoins sync the way the Sync button does — through a manual
		// scroll's override and even an earlier sync-off — because the
		// reader just pointed at the words they want followed.
		setWantSync(true);
		resume();
	}, [jumpTo?.nonce]);

	/** One control for "follow the song": resumes after a manual scroll too. */
	const followOn = syncing && !manual;
	const toggleSync = () => {
		if (followOn) {
			setWantSync(false);
		} else {
			setWantSync(true);
			resume();
			// Rejoining is a promise to be AT the song, not merely to follow
			// its next move (owner's report: Sync from the dock left the
			// page where it was until the line happened to change). The
			// page scrolls to the current line on this signal.
			onSyncEngaged?.();
		}
	};

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

	// The hero's cover spins on this (D-080).
	useEffect(() => {
		onPlayingChange?.(playing);
	}, [playing, onPlayingChange]);

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
	// "No recording found" claimed something untrue (D-070). We do not look for
	// recordings; we read the one Genius has already linked to the song, and a
	// blank there means Genius never filled the field — not that no recording
	// exists. For a song with a hundred million plays, telling the reader it
	// has no recording is simply wrong, and the "Find it on YouTube" button
	// sitting beside the notice contradicts it in the same breath.
	const notice = searching
		? "Finding the recording"
		: noRecording
			? "No player for this one"
			: status === "unavailable"
				? (reason ?? "Playback unavailable")
				: !ready
					? "Loading"
					: playing && drifted && wantSync !== true
						? "Timings are from another cut"
						: playing && !synced
							? "No timings"
							: playing && manual
								? // Says what happened AND where the way back is (the
									// owner's review of "Manual scroll": a state label
									// with no exit reads as a warning, not a status).
									// Short enough for the clamp — D-114's lesson.
									"Scrolled away — Sync rejoins the lyrics"
								: preview
									? "Preview only — sign in to Premium"
									: source === "spotify" && duration === 0
										? "Spotify Premium plays full songs"
										: borrowed
											? "No Spotify match — playing from YouTube"
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
				data-source={asking ? "choose" : source}
				variants={riseVariants}
				initial="hidden"
				animate="visible"
				transition={transition.editorial}
			>
				{/*
				  The question, standing where the transport will (D-112). Premium
				  is a fact about the reader that nothing on our side can detect,
				  and the two answers genuinely differ: the embed plays the full
				  song only for a Premium browser and a preview for everyone
				  else, where YouTube plays whole songs for all — with a small
				  video the reader may not want. So the reader is asked once,
				  told which way is better, and can change their mind below.
				*/}
				{asking && (
					<div className="playback__choose">
						<p className="playback__choose-title text-caption text-ink">
							Do you listen on Spotify Premium?
						</p>
						<p className="playback__choose-hint text-micro">
							Premium plays the full song in a clean audio card — no video.
							Without it, YouTube plays every song.
						</p>
						<div className="playback__choose-row">
							<button
								type="button"
								className="playback__choose-btn"
								data-primary
								onClick={() => choose("spotify")}
							>
								Yes — play with Spotify
							</button>
							<button
								type="button"
								className="playback__choose-btn"
								onClick={() => choose("youtube")}
							>
								No — use YouTube
							</button>
						</div>
					</div>
				)}

				{/*
				  The play toggle and the scrub are YouTube furniture (D-112):
				  the Spotify card carries its own transport, and a second set
				  of controls driving the same song would leave the reader
				  guessing which one is telling the truth.
				*/}
				{!asking && source === "youtube" && !unavailable && (
					<button
						type="button"
						onClick={toggle}
						disabled={!ready}
						aria-label={playing ? "Pause" : "Play"}
						className="playback__toggle"
						// React 19's dev differ mis-reads boolean attributes
						// through the streamed Await boundary and reports the
						// server as having omitted `disabled` (D-110). Measured
						// otherwise: the stream carries disabled="" and the live
						// DOM holds it through hydration. Dev-only noise — but
						// noise on every load teaches people to ignore warnings.
						suppressHydrationWarning
					>
						{playing ? <PauseIcon /> : <PlayIcon />}
					</button>
				)}

				{/*
				  In the hero the column IS the player (D-081): the disc, the
				  title and the artist already stand directly above these
				  controls, so repeating them here was the record redundancy
				  again, in words. The name returns when the bar DOCKS —
				  pinned to the foot of a scrolled page, the hero is gone and
				  the bar is the only thing saying what is playing. Notices
				  ("Loading", "Timings are from another cut") speak in both
				  states; they are the bar's own facts, not the page's.
				*/}
				{/*
				  Rendered only when it has something to say (D-082). In the hero
				  the meta is the transport's caption line — a notice, or nothing.
				  An empty span still owns a grid row, and the empty row's gap
				  pushed the status area around whenever a notice appeared.
				*/}
				{!asking && (docked || notice) && (
					<span className="playback__meta">
						{docked && (
							<span className="playback__title text-caption text-ink">
								{title}
							</span>
						)}
						<span
							className="playback__status text-micro"
							data-notice={notice ? "" : undefined}
						>
							{notice ?? (docked ? artist : "")}
						</span>
					</span>
				)}

				{/*
				  The scrub row — always, not only when docked (D-080). The
				  seekbar used to render behind `docked &&`, and D-079's rail
				  never docks, so the split view silently retired the seekbar
				  along with the dock. Times are decoration for the eye; the
				  input's aria-valuetext is the accessible reading.
				*/}
				{!asking && source === "youtube" && !unavailable && (
					<div className="playback__scrub">
						<span className="playback__time" aria-hidden="true">
							{formatTime(currentTime)}
						</span>
						<Seekbar
							currentTime={currentTime}
							duration={duration}
							disabled={!ready}
							onSeek={seek}
						/>
						<span className="playback__time" aria-hidden="true">
							{formatTime(duration)}
						</span>
					</div>
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

				{/*
				  The Spotify card's mount, on the same terms as the video's:
				  always in the tree, never conditional, because the embed API
				  replaces the node it is given and React must not be holding it
				  when that happens (D-054). The hook fills it only when this
				  reader chose Spotify; `:empty` hides it the rest of the time.
				*/}
				<div ref={spotifyMountRef} className="playback__spotify" />

				{/*
				  A way out of every dead end. With an id we know exactly which
				  video the reader wanted; without one, Genius simply has no
				  recording for this song, and a search is the honest next step
				  rather than a link we cannot honour (D-055).
				*/}
				{!asking &&
					unavailable &&
					(videoId ? (
						<a
							href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`}
							target="_blank"
							rel="noopener noreferrer"
							className="playback__elsewhere text-micro"
						>
							Watch on YouTube
						</a>
					) : (
						<a
							href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${title}`)}`}
							target="_blank"
							rel="noopener noreferrer"
							className="playback__elsewhere text-micro"
						>
							Find it on YouTube
						</a>
					))}

				{/*
				  Follow the song — one control replacing the old Resync pill.
				  Present whenever there are timings to follow, pressed when the
				  canvas is following, and able to overrule the drift default:
				  a reader who wants sync against a mismatched cut gets their
				  choice, with the notice standing down once they have made it.
				*/}
				{!asking && synced && !unavailable && (
					<button
						type="button"
						onClick={toggleSync}
						aria-pressed={followOn}
						className="playback__sync px-3 py-1.5 text-micro"
					>
						{/*
						  The state, said with motion rather than with fill
						  (D-085). Fill alone could not say it: the play toggle
						  beside this pill is also a filled accent shape, so
						  "filled = following" read as "another button", not as
						  a state. The bars move while the canvas is following
						  and lie flat when it is not — the one cue the rest of
						  the row cannot counterfeit. Decorative: aria-pressed
						  already tells assistive tech the same fact.
						*/}
						<span className="playback__sync-wave" aria-hidden="true">
							<span />
							<span />
							<span />
						</span>
						Sync
					</button>
				)}

				{/*
				  The way back from a one-time answer (D-112). A choice with no
				  visible undo is a trap for the reader who mis-clicked or whose
				  circumstances changed — Premium lapses, Premium arrives. Hero
				  only: docked, the bar is down to essentials over the lyrics.
				*/}
				{!asking && !docked && choice && (
					<button
						type="button"
						className="playback__switch text-micro"
						onClick={() => choose(choice === "spotify" ? "youtube" : "spotify")}
					>
						{choice === "spotify" ? "Switch to YouTube" : "Switch to Spotify"}
					</button>
				)}
			</motion.div>
		</div>
	);
}
