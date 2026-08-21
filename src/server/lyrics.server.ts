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
 */

import { cached, TTL } from "../lib/cache";
import { fetchTrack, searchTracks } from "../lib/clients/lrclib";
import type { Track, TrackSummary } from "../lib/types";
import { findArtwork } from "./genius.server";
import { extractPalette } from "./palette.server";

/**
 * Artwork lookup, cached by name rather than by track id.
 *
 * Autocomplete needs a thumbnail per result, which would otherwise mean a
 * Genius call per keystroke per row. Keying on artist+title means the same
 * recording is looked up once across every search and every track page that
 * mentions it, and held for 30 days.
 */
function getArtwork(title: string, artist: string) {
	return cached(
		`art:${artist.toLowerCase()}::${title.toLowerCase()}`,
		TTL.track,
		() => findArtwork(title, artist),
	);
}

/**
 * PRD §4/§5: lyrics must load in under 500ms, so this is cached for 30 days.
 * Currently backed by the in-memory dev adapter — see OD-001.
 */
export function getTrack(id: string): Promise<Track | null> {
	return cached(`track:${id}`, TTL.track, async () => {
		const track = await fetchTrack(id);
		if (!track) return null;

		// Artwork and palette are enhancements layered onto the lyrics, never
		// dependencies of them. Both helpers swallow their own failures and
		// return null, so a Genius outage costs the hero image and the accent
		// colour — the words still render.
		const artwork = await getArtwork(track.title, track.artist);

		// Extracted from the thumbnail, not the full image: enough pixels for
		// colour, a fraction of the bytes to fetch and decode (D-016).
		const palette = artwork ? await extractPalette(artwork.thumbnail) : null;

		return { ...track, artwork, palette };
	});
}

export function searchLyrics(
	query: string,
	limit = 8,
): Promise<TrackSummary[]> {
	const normalised = query.trim().toLowerCase();
	if (normalised.length < 2) return Promise.resolve([]);

	return cached(`search:${limit}:${normalised}`, TTL.search, async () => {
		const results = await searchTracks(normalised, { limit });

		// Thumbnails for the autocomplete (PRD §3.1). Fetched in parallel and
		// individually cached, so a warm cache makes this free. Each lookup
		// already swallows its own failures, so a Genius outage costs the
		// thumbnails and leaves the results intact.
		return Promise.all(
			results.map(async (result) => ({
				...result,
				artwork: await getArtwork(result.title, result.artist),
			})),
		);
	});
}
