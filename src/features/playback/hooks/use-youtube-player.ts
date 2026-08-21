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
		options: Record<string, unknown>,
	) => YTPlayer;
	PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
}

declare global {
	interface Window {
		YT?: YTNamespace;
		onYouTubeIframeAPIReady?: () => void;
	}
}

const API_SRC = "https://www.youtube.com/iframe_api";

/** Resolves once the IFrame API is ready; shared across every mount. */
let apiReady: Promise<void> | null = null;

function loadApi(): Promise<void> {
	if (apiReady) return apiReady;

	apiReady = new Promise((resolve) => {
		if (window.YT?.Player) {
			resolve();
			return;
		}
		// The API calls this global exactly once when it finishes loading.
		window.onYouTubeIframeAPIReady = () => resolve();

		if (!document.querySelector(`script[src="${API_SRC}"]`)) {
			const script = document.createElement("script");
			script.src = API_SRC;
			document.head.appendChild(script);
		}
	});

	return apiReady;
}

export interface PlaybackState {
	ready: boolean;
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
	const [ready, setReady] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);

	useEffect(() => {
		if (!videoId || !mountRef.current) return;

		let cancelled = false;
		let poll: ReturnType<typeof setInterval> | undefined;

		loadApi().then(() => {
			if (cancelled || !mountRef.current || !window.YT) return;

			playerRef.current = new window.YT.Player(mountRef.current, {
				videoId,
				playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
				events: {
					onReady: (event: { target: YTPlayer }) => {
						if (cancelled) return;
						setReady(true);
						setDuration(event.target.getDuration());
					},
					onStateChange: (event: { data: number }) => {
						if (cancelled || !window.YT) return;
						setPlaying(event.data === window.YT.PlayerState.PLAYING);
					},
				},
			});

			poll = setInterval(() => {
				const player = playerRef.current;
				if (!player) return;
				setCurrentTime(player.getCurrentTime());
			}, POLL_MS);
		});

		return () => {
			cancelled = true;
			if (poll) clearInterval(poll);
			playerRef.current?.destroy();
			playerRef.current = null;
			setReady(false);
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

	return { ready, playing, currentTime, duration, toggle, seek };
}
