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

/**
 * Album art, sourced from Genius (OD-005). Null whenever no token is
 * configured or no confident match was found — a wrong hero image is worse
 * than no hero image.
 */
export interface Artwork {
	full: string;
	thumbnail: string;
	geniusId: number;
	/** 0–1 match confidence. Retained so bad matches are diagnosable. */
	matchScore: number;
}

/**
 * Accent palette derived from album art (PRD §3.2).
 *
 * Stored as ready-to-use OKLCH strings: the values are written straight into
 * CSS custom properties, so no colour maths happens in the browser.
 */
export interface Palette {
	accent: string;
	accentSoft: string;
	glow: string;
	/** Source swatch before normalisation. Kept so bad results are diagnosable. */
	sourceHex: string;
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

/**
 * Everything derived from album art. Resolved separately from the lyrics and
 * streamed in after them, so the words never wait on an image (D-017).
 */
export interface TrackVisuals {
	artwork: Artwork | null;
	palette: Palette | null;
}

/** One thing the synthesis was built from (PRD §3.5, "The Source Gallery"). */
export interface InsightSource {
	title: string;
	url: string;
	kind: "article" | "video";
	thumbnail: string | null;
}

/**
 * A pull-quote from the artist or producer (PRD §3.5, "The Quote").
 *
 * Only ever present when it came from a real source. An LLM asked what a song
 * means will happily invent a plausible quote and attribute it to the artist,
 * and this product presents context as coming "directly from the original
 * creators" — so an unsourced quote is not a lesser feature, it is a
 * fabrication. No source, no quote.
 */
export interface InsightQuote {
	text: string;
	attribution: string;
	/** Index into `Insight.sources`. Never null; see above. */
	sourceIndex: number;
}

export interface Insight {
	synthesis: string;
	quote: InsightQuote | null;
	sources: InsightSource[];
	/** True when generated without web grounding — synthesis only, no quote. */
	ungrounded: boolean;
}

export interface Track extends TrackSummary {
	stanzas: Stanza[];
	/** True when timestamps are present and auto-scroll is possible (PRD §3.2). */
	synced: boolean;
}
