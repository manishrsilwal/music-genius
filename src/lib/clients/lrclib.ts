/**
 * LRCLIB client (ARCHITECTURE.md D-001, PRD §2).
 *
 * Free and open — no API key, no auth. The trade-off is that metadata is
 * user-contributed and frequently malformed, so nothing leaves this module
 * without passing through normalisation.
 */

import { buildStanzas } from "../lrc";
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

function normaliseNames(raw: LrclibRecord): { title: string; artist: string } {
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

function toSummary(raw: LrclibRecord): TrackSummary {
	const { title, artist } = normaliseNames(raw);
	return {
		id: String(raw.id),
		title,
		artist,
		album: clean(raw.albumName) || null,
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
	return { ...toSummary(raw), stanzas, synced, artwork: null };
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

	return [...best.values()];
}

/* -------------------------------------------------------------------------
   Public API
   ---------------------------------------------------------------------- */

export async function searchTracks(
	query: string,
	options: { limit?: number; signal?: AbortSignal } = {},
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
	return dedupe(usable.map(toSummary)).slice(0, options.limit ?? 8);
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
