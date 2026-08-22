import { useCallback, useEffect, useRef, useState } from "react";

/**
 * YouTube IFrame player (PRD §3.2, ARCHITECTURE.md D-022).
 *
 * The player is deliberately VISIBLE. YouTube's developer policies forbid
 * "a background player, meaning a player that is not displayed in the page,
 * tab, or screen that the user is viewing", and separately forbid isolating
 * the audio from the video. The PRD's "audio-only" framing is precisely what
 * the policy names, so it is not implemented.
 *
 * Minimal local typings rather than @types/youtube: we use four methods.
 */

interface YTPlayer {
	playVideo(): void;
	pauseVideo(): void;
	seekTo(seconds: number, allowSeekAhead: boolean): void;
	getCurrentTime(): number;
	getDuration(): number;
	destroy(): void;
}

interface YTNamespace {
	Player: new (
		element: HTMLElement | string,
		options: PlayerOptions,
	) => YTPlayer;
	PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
}

/**
 * Only the parameters we actually use, spelled out rather than left as
 * `Record<string, unknown>`. A dead `modestbranding: 1` sat here unnoticed for
 * as long as it took to read the docs — deprecated August 2023, no effect —
 * because an index signature accepts anything (D-039).
 */
interface PlayerVars {
	/** Inline playback on iOS rather than forced fullscreen. */
	playsinline?: 0 | 1;
	/** 0 limits end-of-video suggestions to the same channel. */
	rel?: 0 | 1;
	/** 0 removes the control bar, title overlay and centre play button. */
	controls?: 0 | 1;
	/** 3 hides annotations. */
	iv_load_policy?: 1 | 3;
}

interface PlayerOptions {
	videoId: string;
	playerVars?: PlayerVars;
	events?: {
		onReady?: (event: { target: YTPlayer }) => void;
		onStateChange?: (event: { data: number }) => void;
		onError?: (event: { data: number }) => void;
	};
}

/**
 * The IFrame API's error codes. 101 and 150 are the same condition reported
 * twice, and between them they are the common one: a rights holder who allows
 * the video on youtube.com and nowhere else. Major-label official uploads are
 * the usual case, which means the tracks most likely to be searched for are
 * the most likely to fail.
 */
const YT_ERROR: Record<number, string> = {
	2: "invalid video id",
	5: "the player could not start",
	100: "the video has been removed",
	101: "the owner does not allow embedding",
	150: "the owner does not allow embedding",
};

/**
 * A code turned into something a reader can act on. Exported because this is
 * the part worth testing: an unknown code must still produce a sentence, since
 * the whole point is that no failure renders as an endless "Loading" (D-054).
 */
export function describeYouTubeError(code: number): string {
	return YT_ERROR[code] ?? "playback failed";
}

declare global {
	interface Window {
		YT?: YTNamespace;
		onYouTubeIframeAPIReady?: () => void;
	}
}

const API_SRC = "https://www.youtube.com/iframe_api";

/**
 * How long to wait for youtube.com to hand us a player before giving up.
 *
 * There has to be a limit. A tracker blocker, a corporate proxy or a plain bad
 * connection leaves the script request hanging rather than failing, and a
 * promise that never settles renders as "Loading" until the reader closes the
 * tab. Generous enough to survive a slow phone; short enough to be an answer.
 */
const API_TIMEOUT_MS = 8_000;

/**
 * And for the player itself. The script can load while the player never
 * initialises — an embed the owner has restricted sometimes reports nothing at
 * all rather than firing `onError`.
 */
const READY_TIMEOUT_MS = 12_000;

/** Resolves once the IFrame API is ready; shared across every mount. */
let apiReady: Promise<void> | null = null;

function loadApi(): Promise<void> {
	if (apiReady) return apiReady;

	apiReady = new Promise<void>((resolve, reject) => {
		if (window.YT?.Player) {
			resolve();
			return;
		}

		const timer = setTimeout(
			() => reject(new Error("timed out loading the YouTube API")),
			API_TIMEOUT_MS,
		);

		// The API calls this global exactly once when it finishes loading.
		window.onYouTubeIframeAPIReady = () => {
			clearTimeout(timer);
			resolve();
		};

		const existing = document.querySelector<HTMLScriptElement>(
			`script[src="${API_SRC}"]`,
		);
		if (!existing) {
			const script = document.createElement("script");
			script.src = API_SRC;
			// Fires when the request is blocked outright, which is the common
			// case and the one that used to hang until the timeout.
			script.onerror = () => {
				clearTimeout(timer);
				reject(new Error("the YouTube API could not be loaded"));
			};
			document.head.appendChild(script);
		}
	});

	// A rejected promise must not be cached, or one blocked request would make
	// every later track in the session fail instantly without retrying.
	apiReady.catch(() => {
		apiReady = null;
	});

	return apiReady;
}

/**
 * `unavailable` is a real outcome, not an edge case (D-054). Playback depends
 * on a third party that can refuse for reasons entirely outside this product,
 * and the reader is owed an answer rather than a spinner.
 */
export type PlaybackStatus = "loading" | "ready" | "unavailable";

export interface PlaybackState {
	status: PlaybackStatus;
	ready: boolean;
	/** Why playback is unavailable, in words a reader can act on. Null until it is. */
	reason: string | null;
	playing: boolean;
	/** Seconds. Polled, so treat as approximate. */
	currentTime: number;
	duration: number;
	toggle: () => void;
	seek: (seconds: number) => void;
}

/**
 * Poll interval for the playback clock. The IFrame API pushes state changes
 * but not time, so position has to be read. 250ms is well inside a stanza's
 * duration and costs nothing measurable.
 */
const POLL_MS = 250;

export function useYouTubePlayer(
	videoId: string | null,
	mountRef: React.RefObject<HTMLDivElement | null>,
): PlaybackState {
	const playerRef = useRef<YTPlayer | null>(null);
	const [status, setStatus] = useState<PlaybackStatus>("loading");
	const [reason, setReason] = useState<string | null>(null);
	const [playing, setPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);

	useEffect(() => {
		if (!videoId || !mountRef.current) return;

		let cancelled = false;
		let poll: ReturnType<typeof setInterval> | undefined;
		let readyTimer: ReturnType<typeof setTimeout> | undefined;

		setStatus("loading");
		setReason(null);

		const fail = (why: string) => {
			if (cancelled) return;
			if (readyTimer) clearTimeout(readyTimer);
			if (poll) clearInterval(poll);
			console.warn(`[playback] ${why}`);
			setStatus("unavailable");
			setReason(why);

			// Tear the dead player down and empty its container, so the box does
			// not sit there black. Deferred, because `onError` calls this from
			// inside the player's own event dispatch and destroying it there
			// throws.
			setTimeout(() => {
				try {
					playerRef.current?.destroy();
				} catch {
					// Never initialised; nothing to destroy.
				}
				playerRef.current = null;
				mountRef.current?.replaceChildren();
			}, 0);
		};

		loadApi().then(() => {
			if (cancelled || !mountRef.current || !window.YT) return;

			/*
			 * Hand YouTube a node React has never heard of (D-054).
			 *
			 * `new YT.Player(el)` does not render INTO the element it is given,
			 * it REPLACES it with an iframe — and `destroy()` then removes what
			 * it put there. Passing a React-rendered node means React and the
			 * IFrame API both believe they own it: React holds a reference to a
			 * node that is no longer in the document, and on any remount the
			 * player is built against a detached element, so the iframe never
			 * appears on the page and `onReady` never fires. A permanent
			 * "Loading" with an empty black box is exactly what that looks
			 * like.
			 *
			 * So `mountRef` is now a stable container React owns and never
			 * touches, and the node YouTube destroys is created here.
			 */
			const host = document.createElement("div");
			mountRef.current.replaceChildren(host);

			// The script can load while the player never initialises. Without
			// this the reader waits on something that is not coming.
			readyTimer = setTimeout(
				() => fail("the player did not start"),
				READY_TIMEOUT_MS,
			);

			playerRef.current = new window.YT.Player(host, {
				videoId,
				/**
				 * Suppressing the player's UI is not the same as suppressing
				 * the player, and only the first is ours to do (D-039).
				 *
				 * `controls: 0` is an official parameter: it removes the
				 * control bar, the title overlay and the large red play button
				 * that competed with our own Play control. What remains is the
				 * video image itself, still displayed — which is what III.I.9
				 * requires. Hiding the element with CSS would not be a
				 * different technique for the same thing; it would be the
				 * violation.
				 *
				 * `modestbranding` was dropped: deprecated 15 August 2023 and
				 * documented as having no effect, so we were passing a dead
				 * parameter. `disablekb` is deliberately left at its default —
				 * keyboard control of a focused player is an accessibility
				 * feature, not chrome.
				 */
				playerVars: {
					playsinline: 1,
					rel: 0,
					controls: 0,
					iv_load_policy: 3,
				},
				events: {
					onReady: (event: { target: YTPlayer }) => {
						if (cancelled) return;
						if (readyTimer) clearTimeout(readyTimer);
						setStatus("ready");
						setDuration(event.target.getDuration());

						// Started here, not beside the constructor. The methods on
						// a YT.Player are not callable until it is ready, so
						// polling early threw on every tick.
						poll = setInterval(() => {
							const player = playerRef.current;
							if (!player) return;
							try {
								setCurrentTime(player.getCurrentTime());
							} catch {
								// The iframe can go away under us on navigation.
							}
						}, POLL_MS);
					},
					onStateChange: (event: { data: number }) => {
						if (cancelled || !window.YT) return;
						setPlaying(event.data === window.YT.PlayerState.PLAYING);
					},
					onError: (event: { data: number }) => {
						fail(describeYouTubeError(event.data));
					},
				},
			});
		}, fail);

		return () => {
			cancelled = true;
			if (poll) clearInterval(poll);
			if (readyTimer) clearTimeout(readyTimer);
			try {
				playerRef.current?.destroy();
			} catch {
				// `destroy` throws if the player never finished initialising,
				// which is exactly the case this cleanup exists to handle.
			}
			playerRef.current = null;
			// Whatever the API left behind — an iframe, a half-built player, or
			// nothing — the container goes back to empty so the next mount
			// starts from a known state rather than from wreckage.
			mountRef.current?.replaceChildren();
			setStatus("loading");
			setReason(null);
			setPlaying(false);
			setCurrentTime(0);
		};
	}, [videoId, mountRef]);

	const toggle = useCallback(() => {
		const player = playerRef.current;
		if (!player) return;
		if (playing) player.pauseVideo();
		else player.playVideo();
	}, [playing]);

	const seek = useCallback((seconds: number) => {
		playerRef.current?.seekTo(seconds, true);
	}, []);

	return {
		status,
		ready: status === "ready",
		reason,
		playing,
		currentTime,
		duration,
		toggle,
		seek,
	};
}
