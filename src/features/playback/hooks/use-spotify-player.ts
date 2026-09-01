import { useCallback, useEffect, useRef, useState } from "react";

import type { PlaybackState, PlaybackStatus } from "./use-youtube-player";

/**
 * Spotify iFrame Embed player (D-112).
 *
 * The embed is an audio-shaped card — cover, title, play control, scrubber —
 * which is exactly why it exists here: the reader who chose Spotify chose no
 * video. It needs no API key and no user cap; what it costs is decided by the
 * reader's own browser: logged into Spotify there, the full track plays;
 * logged out, roughly thirty seconds of preview. That trade is the reader's
 * to make, which is why the bar asks instead of assuming (D-112).
 *
 * The Embed API pushes `playback_update` events carrying the playhead in
 * milliseconds — the same clock `useYouTubePlayer` polls for, so this hook
 * honours the same `PlaybackState` contract and the sync engine cannot tell
 * the two apart.
 *
 * Minimal local typings, as with the YouTube hook: we use five members.
 */

interface EmbedController {
	togglePlay(): void;
	seek(seconds: number): void;
	destroy(): void;
	addListener(
		event: "ready" | "playback_update",
		listener: (payload?: PlaybackUpdate) => void,
	): void;
}

interface PlaybackUpdate {
	data: {
		isPaused: boolean;
		isBuffering: boolean;
		/** Milliseconds, both of them. */
		duration: number;
		position: number;
	};
}

interface IframeApi {
	createController(
		element: HTMLElement,
		options: { uri: string; width: string | number; height: string | number },
		callback: (controller: EmbedController) => void,
	): void;
}

declare global {
	interface Window {
		onSpotifyIframeApiReady?: (api: IframeApi) => void;
	}
}

const API_SRC = "https://open.spotify.com/embed/iframe-api/v1";

/**
 * Same shape and same reasoning as the YouTube loader: a tracker blocker or a
 * bad connection leaves the script hanging rather than failing, and a promise
 * that never settles renders as "Loading" forever (D-054).
 */
const API_TIMEOUT_MS = 8_000;
const READY_TIMEOUT_MS = 12_000;

/**
 * The embed card's fixed height — Spotify's compact variant. Exported so the
 * stylesheet's reserve and the controller agree on one number.
 */
export const EMBED_HEIGHT = 80;

/**
 * Spotify's signed-out preview runs ~30 seconds; nothing under this is a
 * whole song the lyrics were timed against.
 */
const PREVIEW_MAX_S = 35;

/** Below this, a short duration might BE the whole song, not a preview. */
const REAL_TRACK_MIN_S = 60;

/**
 * Whether the embed is serving the signed-out preview rather than the song
 * (D-114). The embed cannot be asked directly — it is a cross-origin iframe —
 * but it confesses through its clock: `playback_update` reports ~30 seconds
 * of duration against lyrics timed for a whole track. The distinction
 * matters twice over: the reader is owed "sign in for the full song" rather
 * than silence at the fade-out, and the drift detector (D-075) would read
 * the same mismatch as "timings from another cut" — a wrong diagnosis with a
 * wrong remedy, since it defaults sync off for a clock that is actually
 * correct for as long as it runs.
 */
export function looksLikePreview(
	duration: number,
	lyricsDuration: number | null,
): boolean {
	if (duration <= 0 || duration > PREVIEW_MAX_S) return false;
	// Without a recorded lyrics duration, a short clock is unjudgeable — a
	// 30-second song exists. Say nothing rather than accuse.
	return lyricsDuration !== null && lyricsDuration > REAL_TRACK_MIN_S;
}

/** Resolves to the API object once; shared across every mount. */
let apiReady: Promise<IframeApi> | null = null;

function loadApi(): Promise<IframeApi> {
	if (apiReady) return apiReady;

	apiReady = new Promise<IframeApi>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("timed out loading the Spotify embed API")),
			API_TIMEOUT_MS,
		);

		// Unlike YouTube's, this callback HANDS OVER the API object rather than
		// announcing a global — so the resolved promise is the only place it
		// lives, and every later mount must come through here.
		window.onSpotifyIframeApiReady = (api) => {
			clearTimeout(timer);
			resolve(api);
		};

		const existing = document.querySelector<HTMLScriptElement>(
			`script[src="${API_SRC}"]`,
		);
		if (!existing) {
			const script = document.createElement("script");
			script.src = API_SRC;
			script.async = true;
			script.onerror = () => {
				clearTimeout(timer);
				reject(new Error("the Spotify embed could not be loaded"));
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

export function useSpotifyPlayer(
	trackId: string | null,
	mountRef: React.RefObject<HTMLDivElement | null>,
): PlaybackState {
	const controllerRef = useRef<EmbedController | null>(null);
	/*
	 * Whether the embed's playback SESSION exists yet (D-134, fourth
	 * round). The controller silently drops a seek issued before the song
	 * has ever played — so seek-then-play landed at 0:00 and only a second
	 * tap worked. Until the first update that shows the song moving, seeks
	 * are remembered here and delivered the moment the session stands.
	 */
	const sessionLive = useRef(false);
	const pendingSeek = useRef<number | null>(null);
	const [status, setStatus] = useState<PlaybackStatus>("loading");
	const [reason, setReason] = useState<string | null>(null);
	const [playing, setPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);

	useEffect(() => {
		if (!trackId || !mountRef.current) return;

		let cancelled = false;
		let readyTimer: ReturnType<typeof setTimeout> | undefined;

		setStatus("loading");
		setReason(null);

		const fail = (why: string) => {
			if (cancelled) return;
			if (readyTimer) clearTimeout(readyTimer);
			console.warn(`[playback] ${why}`);
			setStatus("unavailable");
			setReason(why);
			setTimeout(() => {
				try {
					controllerRef.current?.destroy();
				} catch {
					// Never initialised; nothing to destroy.
				}
				controllerRef.current = null;
				mountRef.current?.replaceChildren();
			}, 0);
		};

		loadApi().then((api) => {
			if (cancelled || !mountRef.current) return;

			// Hand Spotify a node React has never heard of — `createController`
			// replaces the element it is given, the same ownership fight
			// `useYouTubePlayer` documents (D-054).
			const host = document.createElement("div");
			mountRef.current.replaceChildren(host);

			readyTimer = setTimeout(
				() => fail("the Spotify player did not start"),
				READY_TIMEOUT_MS,
			);

			api.createController(
				host,
				{
					uri: `spotify:track:${trackId}`,
					width: "100%",
					height: EMBED_HEIGHT,
				},
				(controller) => {
					if (cancelled) return;
					controllerRef.current = controller;

					controller.addListener("ready", () => {
						if (cancelled) return;
						if (readyTimer) clearTimeout(readyTimer);
						setStatus("ready");
					});

					// The embed pushes the clock instead of being polled for it.
					// Updates arrive on state changes and periodically during
					// playback — coarser than the YouTube poll, still well inside
					// a lyric line's duration.
					controller.addListener("playback_update", (payload) => {
						if (cancelled || !payload) return;
						const { isPaused, duration: ms, position } = payload.data;
						// The first update that shows the song MOVING is the
						// session standing up — the moment a held-back seek
						// can finally land (D-134, fourth round).
						if (!isPaused) {
							sessionLive.current = true;
							if (pendingSeek.current != null) {
								const target = pendingSeek.current;
								pendingSeek.current = null;
								controllerRef.current?.seek(target);
							}
						}
						setPlaying(!isPaused);
						setCurrentTime(position / 1000);
						if (ms > 0) setDuration(ms / 1000);
					});
				},
			);
		}, fail);

		return () => {
			cancelled = true;
			if (readyTimer) clearTimeout(readyTimer);
			try {
				controllerRef.current?.destroy();
			} catch {
				// `destroy` throws if the controller never finished initialising,
				// which is exactly the case this cleanup exists to handle.
			}
			controllerRef.current = null;
			sessionLive.current = false;
			pendingSeek.current = null;
			mountRef.current?.replaceChildren();
			setStatus("loading");
			setReason(null);
			setPlaying(false);
			setCurrentTime(0);
		};
	}, [trackId, mountRef]);

	const toggle = useCallback(() => {
		controllerRef.current?.togglePlay();
	}, []);

	const seek = useCallback((seconds: number) => {
		// Before the session exists the controller drops this on the floor —
		// remember it as well, and the update listener delivers it the
		// moment the song moves. Attempting the direct seek stays: if the
		// embed does honour it, the re-seek to the same second is a no-op.
		if (!sessionLive.current) {
			pendingSeek.current = seconds;
		}
		controllerRef.current?.seek(seconds);
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
