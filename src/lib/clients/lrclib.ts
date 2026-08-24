/**
 * LRCLIB client (ARCHITECTURE.md D-001, PRD §2).
 *
 * Free and open — no API key, no auth. The trade-off is that metadata is
 * user-contributed and frequently malformed, so nothing leaves this module
 * without passing through normalisation.
 */

import { buildStanzas } from "../lrc";
import { type RankingContext, rankTracks } from "../ranking";
import type { Track, TrackSummary } from "../types";

const BASE = "https://lrclib.net/api";

/**
 * LRCLIB asks clients to identify themselves. Being identifiable is also what
 * earns the benefit of the doubt if we ever trip their rate limiter.
 */
const USER_AGENT =
	"TypographicLyricalExplorer/0.1 (https://github.com/manishrsilwal/music-genius)";

/** Raw upstream shape. Never leaves this file. */
interface LrclibRecord {
	id: number;
	name: string | null;
	trackName: string | null;
	artistName: string | null;
	albumName: string | null;
	duration: number | null;
	instrumental: boolean;
	plainLyrics: string | null;
	syncedLyrics: string | null;
}

export class LrclibError extends Error {
	constructor(
		message: string,
		readonly status: number,
		/** Seconds to wait, when the upstream sent Retry-After. */
		readonly retryAfter?: number,
	) {
		super(message);
		this.name = "LrclibError";
	}
}

async function request<T>(
	path: string,
	signal?: AbortSignal,
): Promise<T | null> {
	const response = await fetch(`${BASE}${path}`, {
		headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
		signal,
	});

	// A track we don't have is an ordinary outcome, not an error.
	if (response.status === 404) return null;

	if (response.status === 429) {
		const retryAfter = Number(response.headers.get("retry-after")) || undefined;
		throw new LrclibError("LRCLIB rate limit reached", 429, retryAfter);
	}

	if (!response.ok) {
		throw new LrclibError(
			`LRCLIB responded ${response.status}`,
			response.status,
		);
	}

	return (await response.json()) as T;
}

/* -------------------------------------------------------------------------
   Normalisation

   Observed in the wild: a track whose artistName and trackName are BOTH
   "Bohemian Rhapsody - Queen". Rendering that raw in an autocomplete row
   looks broken, so we repair the common shapes and leave the rest alone.
   ---------------------------------------------------------------------- */

const SEPARATOR = " - ";

function clean(value: string | null | undefined): string {
	return (value ?? "").replace(/\s+/g, " ").trim();
}

export function normaliseNames(raw: {
	trackName?: string | null;
	artistName?: string | null;
	name?: string | null;
}): { title: string; artist: string } {
	let title = clean(raw.trackName);
	const artist = clean(raw.artistName);

	// Degenerate case: both fields carry the same "A - B" string. We cannot know
	// the intended order, so we apply the dominant user-upload convention,
	// "Title - Artist", and take the trailing segment as the artist.
	if (title && title === artist && title.includes(SEPARATOR)) {
		const cut = title.lastIndexOf(SEPARATOR);
		return {
			title: title.slice(0, cut).trim(),
			artist: title.slice(cut + SEPARATOR.length).trim(),
		};
	}

	// Title redundantly repeats the artist: "Bohemian Rhapsody - Queen".
	if (
		artist &&
		title.toLowerCase().endsWith(`${SEPARATOR}${artist}`.toLowerCase())
	) {
		title = title
			.slice(0, title.length - SEPARATOR.length - artist.length)
			.trim();
	}
	// ...or leads with it: "Queen - Bohemian Rhapsody".
	else if (
		artist &&
		title.toLowerCase().startsWith(`${artist}${SEPARATOR}`.toLowerCase())
	) {
		title = title.slice(artist.length + SEPARATOR.length).trim();
	}

	return {
		title: title || clean(raw.name) || "Untitled",
		artist: artist || "Unknown artist",
	};
}

/**
 * LRCLIB uploads routinely fill `albumName` with whatever was to hand on a
 * single-release upload: the artist, the track name, or the two joined —
 * "Radiohead - Creep". Rendered as-is the subtitle reads
 * "Radiohead · Radiohead - Creep". An album that only restates what is already
 * on screen carries nothing, so treat it as absent here rather than guarding
 * at every place that shows it (OD-016).
 *
 * Only whole-string matches are rejected. A genuine album that merely contains
 * one of the names — "Arijit Singh - India Tour Hits" — is real information
 * and is kept.
 */
export function meaningfulAlbum(
	album: string | null | undefined,
	title: string,
	artist: string,
): string | null {
	const value = clean(album);
	if (!value) return null;

	// Punctuation and spacing only, so "Radiohead - Creep", "Radiohead: Creep"
	// and "Radiohead  Creep" all fold together. Bracketed suffixes are left
	// alone deliberately: "(Redux)" and "(Remastered)" say which recording this
	// is, and hiding a real album is a worse failure than showing a mildly
	// redundant one.
	const fold = (text: string) =>
		text
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, " ")
			.trim();

	const folded = fold(value);
	if (!folded) return null;

	const echoes = new Set([
		fold(artist),
		fold(title),
		`${fold(artist)} ${fold(title)}`,
		`${fold(title)} ${fold(artist)}`,
	]);

	return echoes.has(folded) ? null : value;
}

function toSummary(raw: LrclibRecord): TrackSummary {
	const { title, artist } = normaliseNames(raw);
	return {
		id: String(raw.id),
		title,
		artist,
		album: meaningfulAlbum(raw.albumName, title, artist),
		duration: raw.duration,
		hasSyncedLyrics: Boolean(raw.syncedLyrics),
		instrumental: raw.instrumental,
	};
}

function toTrack(raw: LrclibRecord): Track {
	const { stanzas, synced } = buildStanzas({
		syncedLyrics: raw.syncedLyrics,
		plainLyrics: raw.plainLyrics,
	});
	return { ...toSummary(raw), stanzas, synced };
}

/**
 * Collapse near-duplicates. LRCLIB commonly holds several uploads of the same
 * recording; we keep the one most useful to us — synced lyrics first, then the
 * one with actual lyrics, then the longest (usually the least truncated).
 */
function dedupe(summaries: TrackSummary[]): TrackSummary[] {
	const best = new Map<string, TrackSummary>();

	for (const item of summaries) {
		const key = `${item.artist.toLowerCase()}::${item.title.toLowerCase()}`;
		const existing = best.get(key);
		if (!existing) {
			best.set(key, item);
			continue;
		}
		const better =
			Number(item.hasSyncedLyrics) - Number(existing.hasSyncedLyrics) ||
			(item.duration ?? 0) - (existing.duration ?? 0);
		if (better > 0) best.set(key, item);
	}

	// Ordering moved to src/lib/ranking.ts (OD-028). Deduping is about the same
	// recording uploaded twice; ranking is about which recording the reader
	// meant, and conflating them is what let five covers outrank the original.
	return [...best.values()];
}

/* -------------------------------------------------------------------------
   Public API
   ---------------------------------------------------------------------- */

export async function searchTracks(
	query: string,
	options: {
		limit?: number;
		signal?: AbortSignal;
		/** Who the song is really by, when a caller was able to find out. */
		ranking?: RankingContext;
	} = {},
): Promise<TrackSummary[]> {
	const trimmed = query.trim();
	if (trimmed.length < 2) return [];

	const results = await request<LrclibRecord[]>(
		`/search?q=${encodeURIComponent(trimmed)}`,
		options.signal,
	);
	if (!results) return [];

	// Instrumentals have nothing to read, so they have no place in this product.
	const usable = results.filter(
		(r) => !r.instrumental && (r.syncedLyrics || r.plainLyrics),
	);
	// Rank AFTER deduping and BEFORE slicing, or the limit would cut the list
	// down using LRCLIB's order and then reorder the survivors — which is how
	// an original that sat sixth would be dropped before it could be promoted.
	const ranked = rankTracks(dedupe(usable.map(toSummary)), options.ranking);
	return ranked.slice(0, options.limit ?? 8);
}

export async function fetchTrack(
	id: string,
	signal?: AbortSignal,
): Promise<Track | null> {
	const raw = await request<LrclibRecord>(
		`/get/${encodeURIComponent(id)}`,
		signal,
	);
	return raw ? toTrack(raw) : null;
}
