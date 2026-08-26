import { useCallback, useEffect, useState } from "react";

/**
 * Which player the reader listens through (D-112).
 *
 * Asked once, because it is a fact about the READER, not about a track: with
 * Spotify Premium the embed plays the full song in an audio card and no video
 * appears anywhere; without it the embed would stop at a thirty-second
 * preview, so YouTube plays instead. The product cannot detect a Premium
 * account from outside — only the reader knows — which is why this is a
 * question and not a probe.
 *
 * Stored locally like the taste answers (`tle:preferences`): no account,
 * nothing sent anywhere. Read in an effect rather than in the initialiser,
 * for the same hydration reason as every other `tle:` key.
 */

const KEY = "tle:playback-source";

export type PlayerChoice = "spotify" | "youtube";

export interface PlaybackSourceState {
	/** Null = not asked yet (show the question); undefined = still reading. */
	choice: PlayerChoice | null | undefined;
	choose: (next: PlayerChoice) => void;
}

function parseChoice(stored: string | null): PlayerChoice | null {
	return stored === "spotify" || stored === "youtube" ? stored : null;
}

export function usePlaybackSource(): PlaybackSourceState {
	const [choice, setChoice] = useState<PlayerChoice | null | undefined>(
		undefined,
	);

	useEffect(() => {
		try {
			setChoice(parseChoice(window.localStorage.getItem(KEY)));
		} catch {
			// Private browsing, or storage disabled. Ask; the answer just will
			// not stick past this page.
			setChoice(null);
		}
	}, []);

	const choose = useCallback((next: PlayerChoice) => {
		setChoice(next);
		try {
			window.localStorage.setItem(KEY, next);
		} catch {
			// The choice simply does not persist. The session still works.
		}
	}, []);

	return { choice, choose };
}

/**
 * The player a track actually gets, given the reader's choice and what the
 * catalogue matches offered. Pure, because this table IS the feature:
 *
 *   - Spotify chosen and a Spotify match exists → the embed.
 *   - Spotify chosen but no match → YouTube, with `borrowed` set so the bar
 *     can say why a video appeared for a reader who asked for none. A missing
 *     match must never mean silence when a recording exists (D-055).
 *   - YouTube chosen, or nothing chosen yet → YouTube; the caller decides
 *     whether to show the question first.
 */
export function resolvePlayer(
	choice: PlayerChoice | null | undefined,
	spotifyId: string | null,
	youtubeId: string | null,
): { source: PlayerChoice; borrowed: boolean } {
	if (choice === "spotify") {
		if (spotifyId) return { source: "spotify", borrowed: false };
		return { source: "youtube", borrowed: Boolean(youtubeId) };
	}
	return { source: "youtube", borrowed: false };
}
