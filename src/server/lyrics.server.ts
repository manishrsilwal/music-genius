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
import { findSong } from "./genius.server";
import { extractPalette } from "./palette.server";

// Select the cache backend before any read-through runs (OD-001).
initCache();

const EMPTY_VISUALS: TrackVisuals = {
	artwork: null,
	palette: null,
	youtubeId: null,
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
	return cached(
		`genius:v2:${artist.toLowerCase()}::${title.toLowerCase()}`,
		TTL.track,
		() => findSong(title, artist),
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
 * Artwork, palette and playback source — the slow path, streamed in behind the
 * lyrics (D-017).
 */
export function getTrackVisuals(
	title: string,
	artist: string,
): Promise<TrackVisuals> {
	// v3: `Palette` gained the paper tokens (D-052), so every stored entry
	// predates them — and `PaletteStyle` refuses a partial palette, meaning a
	// stale entry silently renders the old untinted page with no error anywhere.
	// Caught exactly this way; the checklist item earns its place.
	//
	// Still v-aligned with `genius:` beneath it: this wraps that, so bumping
	// only the inner key would leave the stale outer entry serving the old
	// result (D-049).
	const key = `visuals:v3:${artist.toLowerCase()}::${title.toLowerCase()}`;

	return cached(key, TTL.track, async () => {
		const { artwork, youtubeId } = await getGenius(title, artist);
		if (!artwork) return { ...EMPTY_VISUALS, youtubeId };

		// Extracted from the thumbnail, not the full image: enough pixels for
		// colour, a fraction of the bytes to fetch and decode (D-016).
		const palette = await extractPalette(artwork.thumbnail);
		return { artwork, palette, youtubeId };
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
