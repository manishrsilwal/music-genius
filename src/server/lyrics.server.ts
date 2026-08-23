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
import { initCache } from "./cache/index.server";
import { findArtwork, findPlayback } from "./genius.server";
import { extractPalette } from "./palette.server";

// Select the cache backend before any read-through runs (OD-001).
initCache();

const EMPTY_VISUALS: TrackVisuals = {
	artwork: null,
	palette: null,
};

/**
 * One Genius lookup per recording, cached by name rather than by track id.
 *
 * Autocomplete needs a thumbnail per result, which would otherwise mean a
 * Genius call per keystroke per row. Keying on artist+title means the same
 * recording resolves once across every search and every track page that
 * mentions it, and is held for 30 days. It also carries the YouTube id used
 * for playback (D-022), so both come from a single cached lookup.
 */
function getGenius(title: string, artist: string) {
	// v3: the search half only now. The media lookup moved to its own key so
	// artwork stops waiting behind it (D-055).
	return cached(
		`genius:v3:${artist.toLowerCase()}::${title.toLowerCase()}`,
		TTL.track,
		() => findArtwork(title, artist),
	);
}

/**
 * Lyrics and metadata only — the fast path, and the one the reader is waiting
 * for. PRD §4/§5: cached for 30 days, since lyrics effectively never change.
 */
export function getTrack(id: string): Promise<Track | null> {
	// v2: `meaningfulAlbum` changed what a stored track looks like (D-043), and
	// entries live for 30 days. Without a bump the reader keeps being served
	// the pre-fix shape for every track they have already opened — which is
	// exactly how "Arijit Singh · Arijit Singh" survived a fix that worked
	// (D-049). Bump this whenever the parsed shape changes.
	return cached(`track:v2:${id}`, TTL.track, () => fetchTrack(id));
}

/**
 * Artwork and palette — streamed in behind the lyrics (D-017).
 */
export function getTrackVisuals(
	title: string,
	artist: string,
): Promise<TrackVisuals> {
	// v4 alongside `genius:v3` — this wraps it, so bumping only the inner key
	// would leave the stale outer entry serving the old result (D-049). The
	// shape changed too: `youtubeId` left for `getTrackPlayback` (D-055).
	const key = `visuals:v4:${artist.toLowerCase()}::${title.toLowerCase()}`;

	return cached(key, TTL.track, async () => {
		const artwork = await getGenius(title, artist);
		if (!artwork) return EMPTY_VISUALS;

		// Extracted from the thumbnail, not the full image: enough pixels for
		// colour, a fraction of the bytes to fetch and decode (D-016).
		const palette = await extractPalette(artwork.thumbnail);
		return { artwork, palette };
	});
}

/**
 * The playback source, on its own timeline (D-055).
 *
 * A second operation rather than a field on the visuals, for exactly the
 * reason lyrics and visuals were split in D-017: it is three times slower than
 * everything it used to travel with. Genius `/search` answers in ~0.85s;
 * `/songs/{id}` takes ~2.4s to return 120 KB of which we read one field.
 * Bundled, the artwork and palette waited behind it and the reader watched an
 * empty hero for three seconds.
 */
export function getTrackPlayback(
	title: string,
	artist: string,
): Promise<{ youtubeId: string | null }> {
	const key = `playback:v1:${artist.toLowerCase()}::${title.toLowerCase()}`;

	return cached(key, TTL.track, async () => {
		// Shares the `genius:` entry with the visuals, so the search half is
		// paid for once even though both operations need it.
		const artwork = await getGenius(title, artist);
		if (!artwork) return { youtubeId: null };
		return { youtubeId: await findPlayback(artwork.geniusId) };
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

	return cached(`search:v2:${limit}:${normalised}`, TTL.search, () =>
		searchTracks(normalised, { limit }),
	);
}
