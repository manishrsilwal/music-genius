/**
 * Domain types. These are OUR shapes, deliberately not LRCLIB's — the API
 * returns user-contributed metadata of uneven quality, so everything crossing
 * into the app is normalised first. See src/lib/clients/lrclib.ts.
 */

/** A single lyric line. `time` is seconds from track start, null when unsynced. */
export interface LyricLine {
	time: number | null;
	text: string;
}

/**
 * A stanza — the unit the scrollytelling canvas fades in and out (PRD §3.3).
 * Blank lines in the source delimit stanzas.
 */
export interface Stanza {
	id: string;
	lines: LyricLine[];
	/** Seconds. Null for unsynced lyrics. */
	startTime: number | null;
	endTime: number | null;
}

/** Search-result shape: enough to render an autocomplete row, nothing more. */
export interface TrackSummary {
	id: string;
	title: string;
	artist: string;
	album: string | null;
	/** Seconds. */
	duration: number | null;
	hasSyncedLyrics: boolean;
	instrumental: boolean;
}

export interface Track extends TrackSummary {
	stanzas: Stanza[];
	/** True when timestamps are present and auto-scroll is possible (PRD §3.2). */
	synced: boolean;
}
