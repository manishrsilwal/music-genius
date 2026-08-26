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
import { rankTracks } from "../lib/ranking";
import type { Track, TrackSummary, TrackVisuals } from "../lib/types";
import { initCache } from "./cache/index.server";
import {
	findArtwork,
	findCanonicalArtist,
	findPlayback,
} from "./genius.server";
import { extractPalette } from "./palette.server";
import { findSpotifyArtwork } from "./spotify.server";

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
	// v4: the stored shape gained `source` (D-111). v3: the search half only
	// now — the media lookup moved to its own key so artwork stops waiting
	// behind it (D-055).
	return cached(
		`genius:v4:${artist.toLowerCase()}::${title.toLowerCase()}`,
		TTL.track,
		() => findArtwork(title, artist),
	);
}

/**
 * One Spotify lookup per recording, on the same 30-day, name-keyed terms as
 * the Genius entry above (D-111). Misses are not stored — `cached` treats
 * null as absence — which is the behaviour the Genius path already has.
 */
function getSpotify(title: string, artist: string) {
	// v2: the stored shape gained `spotifyId` for the embed player (D-112).
	return cached(
		`spotify:v2:${artist.toLowerCase()}::${title.toLowerCase()}`,
		TTL.track,
		() => findSpotifyArtwork(title, artist),
	);
}

/**
 * Lyrics and metadata only — the fast path, and the one the reader is waiting
 * for. PRD §4/§5: cached for 30 days, since lyrics effectively never change.
 */
export function getTrack(id: string): Promise<Track | null> {
	// v3: `meaningfulAlbum` refuses view-count debris (D-080) — "23M views"
	// survived the fix through this cache until the bump, exactly as the note
	// below predicts.
	// v2: `meaningfulAlbum` changed what a stored track looks like (D-043), and
	// entries live for 30 days. Without a bump the reader keeps being served
	// the pre-fix shape for every track they have already opened — which is
	// exactly how "Arijit Singh · Arijit Singh" survived a fix that worked
	// (D-049). Bump this whenever the parsed shape changes.
	return cached(`track:v3:${id}`, TTL.track, () => fetchTrack(id));
}

/**
 * Artwork and palette — streamed in behind the lyrics (D-017).
 */
export function getTrackVisuals(
	title: string,
	artist: string,
): Promise<TrackVisuals> {
	// v7: the artwork inside gained `spotifyId` (D-112). v6: v5 shipped before
	// `i.scdn.co` was on the palette allowlist, so every Spotify-art track
	// stored a null palette for 30 days — correct-looking entries produced by
	// a bug are exactly what D-049 says a bump is for. v5: Spotify leads
	// (D-111) — a source change is a shape change as far as stored entries
	// are concerned; wraps the inner lookups, so bumping only an inner key
	// would leave the stale outer entry serving the old result.
	const key = `visuals:v7:${artist.toLowerCase()}::${title.toLowerCase()}`;

	return cached(key, TTL.track, async () => {
		// Spotify first: its sleeve is the canonical square at known sizes,
		// where Genius art is routinely a video still or promo crop. Genius
		// answers only when Spotify cannot, so the degradation ladder is
		// two rungs deep before the page goes without art (D-111).
		const artwork =
			(await getSpotify(title, artist)) ?? (await getGenius(title, artist));
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
): Promise<{ youtubeId: string | null; spotifyId: string | null }> {
	// v2: carries `spotifyId` alongside the YouTube id (D-112).
	const key = `playback:v2:${artist.toLowerCase()}::${title.toLowerCase()}`;

	return cached(key, TTL.track, async () => {
		// Both sources, resolved together (D-112): the reader's choice of
		// player is made in the browser, after this has been fetched, so the
		// server cannot know which id will be wanted and sends both.
		//
		// The YouTube id still rides the GENIUS entry, never the Spotify one
		// (D-111) — it lives on the Genius song object. Both inner entries
		// are shared with the visuals lookup, so each search is paid for once.
		const [spotify, genius] = await Promise.all([
			getSpotify(title, artist),
			getGenius(title, artist),
		]);
		return {
			youtubeId: genius?.geniusId ? await findPlayback(genius.geniusId) : null,
			spotifyId: spotify?.spotifyId ?? null,
		};
	});
}

/**
 * Search returns immediately, with no artwork. Thumbnails are requested per
 * row afterwards (PRD §3.1) — bundling them here cost 2s per novel query,
 * which is the opposite of instant.
 */
export async function searchLyrics(
	query: string,
	limit = 8,
): Promise<TrackSummary[]> {
	const normalised = query.trim().toLowerCase();
	if (normalised.length < 2) return [];

	// v3: a POOL is fetched and cached, and the ordering is decided here.
	//
	// The obvious version of this — asking for twice the display limit — was
	// wrong in a way that hid itself: `searchTracks` ranks and then slices, so
	// a six-entry request was cut down using the ranking that has NO hint, and
	// the entry the hint would have promoted was already gone by the time it
	// arrived. Searching "lag ja gale" returns sixteen entries with the only
	// Lata Mangeshkar upload at number ten; the boost was working perfectly on
	// a list she was not in. Cache the pool, rank the pool (OD-028).
	//
	// Deliberately caching the RESULTS and not the ORDER. The ranking hint
	// takes the better part of a second to arrive from Genius and is allowed to
	// miss its deadline, so a first search can legitimately rank without it —
	// and if the ordered list were what got stored, that one unlucky call would
	// be served to everyone for the life of the entry. Ranking on read instead
	// means the hint, which has its own long-lived cache, corrects the order
	// from the second search onward. Both halves are cached; only the cheap
	// pure step runs every time.
	const [tracks, canonicalArtist] = await Promise.all([
		cached(`search:pool:v3:${normalised}`, TTL.search, () =>
			searchTracks(normalised, { limit: POOL }),
		),
		withDeadline(getCanonicalArtist(normalised), RANKING_HINT_MS),
	]);

	return rankTracks(tracks, { canonicalArtist }).slice(0, limit);
}

/**
 * Who the song is by, cached hard.
 *
 * Genius answers in 760–950ms, which is too slow to block autocomplete on but
 * far too useful to skip: it is the only signal that can tell Lata
 * Mangeshkar's "Lag Ja Gale" from five Sanam covers of it. Cached for the same
 * 30 days as every other Genius lookup, so exactly one search per query ever
 * pays for it.
 */
function getCanonicalArtist(query: string): Promise<string | null> {
	return cached(`genius:artist:v1:${query}`, TTL.track, () =>
		findCanonicalArtist(query),
	);
}

/** How long a ranking hint may hold up a search before it is dropped. */
const RANKING_HINT_MS = 900;

/**
 * How many candidates to rank over. Generous, because the entry worth
 * promoting is routinely well down LRCLIB's own order — and ranking can only
 * ever reorder what it was given.
 */
const POOL = 40;

/** Resolves to null rather than rejecting, and never leaves a rejection loose. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
	return Promise.race([
		work.catch(() => null),
		new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
	]);
}
