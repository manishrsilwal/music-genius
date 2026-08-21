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

/**
 * PRD §4/§5: lyrics must load in under 500ms, so this is cached for 30 days.
 * Currently backed by the in-memory dev adapter — see OD-001.
 */
export function getTrack(id: string): Promise<Track | null> {
	return cached(`track:${id}`, TTL.track, () => fetchTrack(id));
}

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
