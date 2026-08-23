/**
 * Genius client — album art and metadata (PRD §2, ARCHITECTURE.md OD-005).
 *
 * Server-only: it holds the access token. Genius has no public lyrics API, so
 * its role here is strictly artwork and metadata; lyrics come from LRCLIB.
 *
 * Degrades to null everywhere when no token is configured, so the app runs
 * unchanged without one.
 */

import type { Artwork } from "../lib/types";
import { env, features } from "./env";

const BASE = "https://api.genius.com";

interface GeniusArtist {
	name: string | null;
}

interface GeniusMedia {
	provider?: string;
	type?: string;
	url?: string;
}

interface GeniusSong {
	id: number;
	title: string | null;
	primary_artist: GeniusArtist | null;
	song_art_image_url: string | null;
	song_art_image_thumbnail_url: string | null;
	header_image_url: string | null;
	/** Present only on the /songs/{id} endpoint, not on search results. */
	media?: GeniusMedia[];
}

interface GeniusSearchResponse {
	response?: { hits?: Array<{ result?: GeniusSong }> };
}

/* -------------------------------------------------------------------------
   Matching

   LRCLIB and Genius are independent catalogues with no shared identifier, so a
   track has to be matched by name. Both sides are noisy — remasters, features,
   live versions, punctuation — so we normalise hard before comparing and
   require a minimum score rather than trusting Genius's first hit.
   ---------------------------------------------------------------------- */

/** Strip the noise that differs between catalogues but not between recordings. */
export function canonical(value: string): string {
	return (
		value
			.toLowerCase()
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			// Parenthetical and bracketed qualifiers: (Remastered 2011), [Live], etc.
			.replace(/[([{].*?[)\]}]/g, " ")
			// "feat." / "ft." and everything after
			.replace(/\b(feat|ft|featuring|with)\b.*$/g, " ")
			.replace(/[^a-z0-9]+/g, " ")
			.trim()
	);
}

/** Dice coefficient over bigrams — tolerant of small edits, cheap to compute. */
export function similarity(a: string, b: string): number {
	if (a === b) return 1;
	if (a.length < 2 || b.length < 2) return 0;

	const bigrams = (value: string) => {
		const set = new Map<string, number>();
		for (let i = 0; i < value.length - 1; i++) {
			const pair = value.slice(i, i + 2);
			set.set(pair, (set.get(pair) ?? 0) + 1);
		}
		return set;
	};

	const left = bigrams(a);
	const right = bigrams(b);
	let shared = 0;
	for (const [pair, count] of left) {
		const other = right.get(pair);
		if (other) shared += Math.min(count, other);
	}

	return (2 * shared) / (a.length - 1 + (b.length - 1));
}

/**
 * Below this we treat the result as "no match" and show no art, rather than
 * showing confidently wrong art. A mismatched hero image is worse than none.
 */
const MATCH_THRESHOLD = 0.62;

/** Exported for tests: this threshold decides whether art is shown at all. */
export function scoreNames(
	candidateTitle: string,
	candidateArtist: string,
	title: string,
	artist: string,
): number {
	const titleScore = similarity(canonical(candidateTitle), canonical(title));
	const artistScore = similarity(canonical(candidateArtist), canonical(artist));
	// Title carries more weight: artist strings vary far more between catalogues.
	return titleScore * 0.65 + artistScore * 0.35;
}

export { MATCH_THRESHOLD };

function scoreHit(song: GeniusSong, title: string, artist: string): number {
	const titleScore = similarity(canonical(song.title ?? ""), canonical(title));
	const artistScore = similarity(
		canonical(song.primary_artist?.name ?? ""),
		canonical(artist),
	);
	// Title carries more weight: artist strings vary far more between catalogues.
	return titleScore * 0.65 + artistScore * 0.35;
}

/* ---------------------------------------------------------------------- */

async function searchGenius(
	query: string,
	signal?: AbortSignal,
): Promise<GeniusSong[]> {
	const response = await fetch(
		`${BASE}/search?q=${encodeURIComponent(query)}`,
		{
			headers: {
				Authorization: `Bearer ${env.geniusAccessToken}`,
				Accept: "application/json",
			},
			signal,
		},
	);

	if (!response.ok) {
		// Artwork is an enhancement; never let it take the page down.
		console.warn(`[genius] search failed: ${response.status}`);
		return [];
	}

	const payload = (await response.json()) as GeniusSearchResponse;
	return (payload.response?.hits ?? [])
		.map((hit) => hit.result)
		.filter((song): song is GeniusSong => Boolean(song));
}

/**
 * Find artwork for a track. Returns null when there is no token, no match, or
 * the match is not confident enough to trust.
 */
/** Index of the first " - " that is not inside brackets, or -1. */
function topLevelSeparator(title: string): number {
	let depth = 0;
	for (let i = 0; i < title.length; i++) {
		const char = title[i];
		if (char === "(" || char === "[" || char === "{") depth++;
		else if (char === ")" || char === "]" || char === "}")
			depth = Math.max(0, depth - 1);
		else if (depth === 0 && title.startsWith(" - ", i)) return i;
	}
	return -1;
}

/**
 * Other readings of a badly-tagged entry, to be adjudicated by Genius rather
 * than guessed at here (D-049).
 *
 * LRCLIB carries a lot of YouTube lyric-channel uploads: `trackName` is
 * "Childish Gambino - Redbone" and `artistName` is the channel, "7clouds".
 * `normaliseNames` cannot help — it only strips the artist it was *given*, and
 * that artist appears nowhere in the title.
 *
 * Both orderings are offered because neither is reliably true: "Artist - Title"
 * is the YouTube convention, "Title - Artist" is common in user uploads. The
 * scoring decides; we only propose.
 *
 * Returns nothing when the recorded artist is one of the halves, since
 * `normaliseNames` has already handled that and re-asking wastes a request
 * against undocumented rate limits (OD-014).
 */
export function splitCandidates(
	title: string,
	artist: string,
): Array<{ title: string; artist: string }> {
	// Only a separator at the top level. "Come and Get Your Love (Single Edit -
	// Audio)" would otherwise split inside the parenthetical and spend two
	// requests on nonsense, against rate limits nobody has documented (OD-014).
	const cut = topLevelSeparator(title);
	if (cut < 0) return [];

	const left = title.slice(0, cut).trim();
	const right = title.slice(cut + 3).trim();
	if (!left || !right) return [];

	const fold = (value: string) => value.trim().toLowerCase();
	if (fold(artist) === fold(left) || fold(artist) === fold(right)) return [];

	return [
		{ title: right, artist: left },
		{ title: left, artist: right },
	];
}

export async function findArtwork(
	title: string,
	artist: string,
	signal?: AbortSignal,
): Promise<Artwork | null> {
	if (!features.artwork) return null;

	async function attempt(
		asTitle: string,
		asArtist: string,
	): Promise<{ song: GeniusSong; score: number } | null> {
		const songs = await searchGenius(`${asArtist} ${asTitle}`, signal);

		let best: GeniusSong | null = null;
		let bestScore = 0;
		for (const song of songs) {
			const score = scoreHit(song, asTitle, asArtist);
			if (score > bestScore) {
				bestScore = score;
				best = song;
			}
		}

		return best ? { song: best, score: bestScore } : null;
	}

	try {
		let hit = await attempt(title, artist);

		// Only on failure, and only ever twice more. A miss here costs the
		// reader the artwork AND the player, since the YouTube id rides along
		// with the Genius match.
		if (!hit || hit.score < MATCH_THRESHOLD) {
			for (const candidate of splitCandidates(title, artist)) {
				const retry = await attempt(candidate.title, candidate.artist);
				if (retry && retry.score > (hit?.score ?? 0)) hit = retry;
				if (hit && hit.score >= MATCH_THRESHOLD) break;
			}
		}

		if (!hit || hit.score < MATCH_THRESHOLD) return null;
		const best = hit.song;
		const bestScore = hit.score;

		const full = best.song_art_image_url ?? best.header_image_url;
		if (!full) return null;

		return {
			full,
			thumbnail: best.song_art_image_thumbnail_url ?? full,
			geniusId: best.id,
			matchScore: Number(bestScore.toFixed(3)),
		};
	} catch (error) {
		console.warn("[genius] artwork lookup failed", error);
		return null;
	}
}

/* -------------------------------------------------------------------------
   Playback source (PRD §3.2, D-022)

   Genius already knows which YouTube video belongs to a song, so we take it
   from there rather than the YouTube Data API — whose search costs 100 quota
   units a call, or roughly 100 tracks a day on the default allowance.
   ---------------------------------------------------------------------- */

/** `watch?v=`, `youtu.be/`, and `/embed/` forms. */
export function toVideoId(url: string): string | null {
	const match =
		url.match(/[?&]v=([\w-]{11})/) ??
		url.match(/youtu\.be\/([\w-]{11})/) ??
		url.match(/\/embed\/([\w-]{11})/);
	return match?.[1] ?? null;
}

async function fetchSong(
	id: number,
	signal?: AbortSignal,
): Promise<GeniusSong | null> {
	const response = await fetch(`${BASE}/songs/${id}`, {
		headers: {
			Authorization: `Bearer ${env.geniusAccessToken}`,
			Accept: "application/json",
		},
		signal,
	});
	if (!response.ok) return null;

	const payload = (await response.json()) as {
		response?: { song?: GeniusSong };
	};
	return payload.response?.song ?? null;
}

/**
 * The YouTube id alone, given a Genius song id (D-055).
 *
 * Split out because it is the expensive half by a wide margin. Measured:
 * `/search` returns 18 KB in ~0.85s, while `/songs/{id}` returns **120 KB in
 * ~2.4s** — a full song object carrying description, annotations and ad
 * configuration, of which we read exactly one field. `text_format` does not
 * shrink it; measured at 118 KB against 120.
 *
 * Keeping the two together meant the artwork, which is ready in under a
 * second, waited three seconds behind the media lookup before anything reached
 * the reader.
 */
export async function findPlayback(
	geniusId: number,
	signal?: AbortSignal,
): Promise<string | null> {
	try {
		const song = await fetchSong(geniusId, signal);
		const media = (song?.media ?? []).find(
			(entry) => entry.provider === "youtube" && entry.url,
		);
		return media?.url ? toVideoId(media.url) : null;
	} catch (error) {
		// Playback is an enhancement; never let it cost us the artwork.
		console.warn("[genius] media lookup failed", error);
		return null;
	}
}
