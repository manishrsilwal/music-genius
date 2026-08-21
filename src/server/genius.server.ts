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

interface GeniusSong {
	id: number;
	title: string | null;
	primary_artist: GeniusArtist | null;
	song_art_image_url: string | null;
	song_art_image_thumbnail_url: string | null;
	header_image_url: string | null;
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
