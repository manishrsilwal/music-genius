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
function canonical(value: string): string {
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
function similarity(a: string, b: string): number {
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
export async function findArtwork(
	title: string,
	artist: string,
	signal?: AbortSignal,
): Promise<Artwork | null> {
	if (!features.artwork) return null;

	try {
		const songs = await searchGenius(`${artist} ${title}`, signal);
		if (songs.length === 0) return null;

		let best: GeniusSong | null = null;
		let bestScore = 0;
		for (const song of songs) {
			const score = scoreHit(song, title, artist);
			if (score > bestScore) {
				bestScore = score;
				best = song;
			}
		}

		if (!best || bestScore < MATCH_THRESHOLD) return null;

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
function toVideoId(url: string): string | null {
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

export interface GeniusResult {
	artwork: Artwork | null;
	/** YouTube video id for playback, when Genius knows one. */
	youtubeId: string | null;
}

/**
 * One Genius lookup serving both the visual layer and playback.
 *
 * The search response carries artwork but not media, so a confident match
 * costs a second request to /songs/{id}. Both are cached together for 30 days.
 */
export async function findSong(
	title: string,
	artist: string,
	signal?: AbortSignal,
): Promise<GeniusResult> {
	const artwork = await findArtwork(title, artist, signal);
	if (!artwork) return { artwork: null, youtubeId: null };

	try {
		const song = await fetchSong(artwork.geniusId, signal);
		const media = (song?.media ?? []).find(
			(entry) => entry.provider === "youtube" && entry.url,
		);
		return {
			artwork,
			youtubeId: media?.url ? toVideoId(media.url) : null,
		};
	} catch (error) {
		// Playback is an enhancement; never let it cost us the artwork.
		console.warn("[genius] media lookup failed", error);
		return { artwork, youtubeId: null };
	}
}
