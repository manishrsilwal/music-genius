/**
 * Server-only lyric service — the single source of business logic.
 *
 * Per TanStack Start guidance, an SSR loader must never fetch its own API
 * route (the loader is isomorphic; URL resolution is not portable). So the
 * operations live here and are exposed through two boundaries:
 *
 *   - src/server/lyrics.functions.ts  → server functions, for loaders
 *   - src/routes/api/*.ts             → HTTP routes, for the browser and
 *                                       any external caller (PRD §4)
 *
 * Lyrics and visuals are deliberately separate operations (D-017). Resolving
 * artwork takes a Genius round-trip plus an image fetch and decode; making the
 * words wait on that put the cold track page at 1.6s against a 500ms target.
 */

import { cached, TTL } from "../lib/cache";
import { fetchTrack, searchTracks } from "../lib/clients/lrclib";
import type { Track, TrackSummary, TrackVisuals } from "../lib/types";
import { findArtwork } from "./genius.server";
import { extractPalette } from "./palette.server";

const EMPTY_VISUALS: TrackVisuals = { artwork: null, palette: null };

/**
 * Lyrics and metadata only — the fast path, and the one the reader is waiting
 * for. PRD §4/§5: cached for 30 days, since lyrics effectively never change.
 */
export function getTrack(id: string): Promise<Track | null> {
	return cached(`track:${id}`, TTL.track, () => fetchTrack(id));
}

/**
 * Artwork and the palette derived from it — the slow path.
 *
 * Keyed by artist and title rather than track id, so the same recording is
 * resolved once across every search result and track page that mentions it,
 * regardless of which LRCLIB upload the reader happened to open.
 */
export function getTrackVisuals(
	title: string,
	artist: string,
): Promise<TrackVisuals> {
	const key = `visuals:${artist.toLowerCase()}::${title.toLowerCase()}`;

	return cached(key, TTL.track, async () => {
		const artwork = await findArtwork(title, artist);
		if (!artwork) return EMPTY_VISUALS;

		// Extracted from the thumbnail, not the full image: enough pixels for
		// colour, a fraction of the bytes to fetch and decode (D-016).
		const palette = await extractPalette(artwork.thumbnail);
		return { artwork, palette };
	});
}

/**
 * Search returns immediately, with no artwork. Thumbnails are requested per
 * row afterwards (PRD §3.1) — bundling them here cost 2s per novel query,
 * which is the opposite of instant.
 */
export function searchLyrics(
	query: string,
	limit = 8,
): Promise<TrackSummary[]> {
	const normalised = query.trim().toLowerCase();
	if (normalised.length < 2) return Promise.resolve([]);

	return cached(`search:${limit}:${normalised}`, TTL.search, () =>
		searchTracks(normalised, { limit }),
	);
}
