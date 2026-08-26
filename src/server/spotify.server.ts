/**
 * Spotify client — canonical album art and track metadata (D-111).
 *
 * Server-only: it holds the client credentials. The role is strictly
 * metadata: playback stays with YouTube, because every Spotify playback path
 * carries a cost this product cannot ask its readers to pay — the Web
 * Playback SDK requires each listener to log in with a Premium account (and a
 * Development-mode app caps at 25 allowlisted users), and the anonymous embed
 * plays ~30-second previews, which would strand line-by-line sync mid-song.
 *
 * The client-credentials flow has none of those constraints: an app token,
 * minted server-side, good for public catalogue data. Degrades to null
 * everywhere when no credentials are configured, so the app runs unchanged
 * without them.
 */

import type { Artwork } from "../lib/types";
import { env, features } from "./env";
import {
	MATCH_THRESHOLD,
	scoreNames,
	searchQuery,
	splitCandidates,
	stripTitleNoise,
} from "./genius.server";

const ACCOUNTS = "https://accounts.spotify.com/api/token";
const BASE = "https://api.spotify.com/v1";

/*
 * The app token, memoised per process rather than pushed through the shared
 * cache: it is a credential, not content, and an hour-lived secret does not
 * belong in a 30-day Redis store. Serverless instances each mint their own,
 * which the token endpoint is built for.
 */
let token: { value: string; expiresAt: number } | null = null;

/** Refresh a minute early, so a token never expires mid-request. */
const EXPIRY_MARGIN_MS = 60_000;

async function getToken(signal?: AbortSignal): Promise<string | null> {
	if (token && token.expiresAt > Date.now()) return token.value;

	const response = await fetch(ACCOUNTS, {
		method: "POST",
		headers: {
			Authorization: `Basic ${Buffer.from(
				`${env.spotifyClientId}:${env.spotifyClientSecret}`,
			).toString("base64")}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: "grant_type=client_credentials",
		signal,
	});

	if (!response.ok) {
		console.warn(`[spotify] token request failed: ${response.status}`);
		return null;
	}

	const payload = (await response.json()) as {
		access_token?: string;
		expires_in?: number;
	};
	if (!payload.access_token) return null;

	token = {
		value: payload.access_token,
		expiresAt:
			Date.now() + (payload.expires_in ?? 3600) * 1000 - EXPIRY_MARGIN_MS,
	};
	return token.value;
}

/** Exported for tests: a stale process-wide token would bleed between cases. */
export function resetSpotifyToken(): void {
	token = null;
}

interface SpotifyImage {
	url: string;
	width: number | null;
	height: number | null;
}

interface SpotifyTrack {
	id: string;
	name: string;
	artists: Array<{ name: string }>;
	album: { images: SpotifyImage[] };
}

interface SpotifySearchResponse {
	tracks?: { items?: SpotifyTrack[] };
}

async function searchSpotify(
	query: string,
	signal?: AbortSignal,
): Promise<SpotifyTrack[]> {
	const bearer = await getToken(signal);
	if (!bearer) return [];

	const response = await fetch(
		`${BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
		{
			headers: {
				Authorization: `Bearer ${bearer}`,
				Accept: "application/json",
			},
			signal,
		},
	);

	if (!response.ok) {
		// Artwork is an enhancement; never let it take the page down.
		console.warn(`[spotify] search failed: ${response.status}`);
		return [];
	}

	const payload = (await response.json()) as SpotifySearchResponse;
	return payload.tracks?.items ?? [];
}

/**
 * A Spotify credit lists every artist separately, where Genius names one
 * primary. Score against the best-matching name, for the same reason
 * `creditedArtists` exists on the Genius side (D-070): whichever artist the
 * LRCLIB billing leads with is *somewhere* in the list.
 */
function scoreTrack(
	track: SpotifyTrack,
	title: string,
	artist: string,
): number {
	let best = 0;
	for (const credited of track.artists) {
		const score = scoreNames(track.name, credited.name, title, artist);
		if (score > best) best = score;
	}
	return best;
}

/**
 * Spotify serves each cover at 640, 300 and 64, largest first. The full image
 * is the hero; the thumbnail renders in autocomplete rows and cover stamps
 * AND feeds palette extraction (D-016), so it takes the middle size — 64px is
 * under what a retina-density 2.25rem stamp needs.
 */
function pickImages(
	images: SpotifyImage[],
): { full: string; thumbnail: string } | null {
	if (images.length === 0) return null;
	const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
	const full = sorted[0]?.url;
	if (!full) return null;
	return { full, thumbnail: sorted[1]?.url ?? full };
}

/**
 * Find canonical album art for a track. Returns null when there are no
 * credentials, no match, or the match is not confident enough to trust — the
 * same bar as Genius (MATCH_THRESHOLD), because a wrong sleeve from a
 * cleaner catalogue is still a wrong sleeve.
 */
export async function findSpotifyArtwork(
	title: string,
	artist: string,
	signal?: AbortSignal,
): Promise<Artwork | null> {
	if (!features.spotify) return null;

	async function attempt(
		asTitle: string,
		asArtist: string,
	): Promise<{ track: SpotifyTrack; score: number } | null> {
		const tracks = await searchSpotify(searchQuery(asTitle, asArtist), signal);

		let best: SpotifyTrack | null = null;
		let bestScore = 0;
		for (const track of tracks) {
			const score = scoreTrack(track, asTitle, asArtist);
			if (score > bestScore) {
				bestScore = score;
				best = track;
			}
		}

		return best ? { track: best, score: bestScore } : null;
	}

	try {
		let hit = await attempt(title, artist);

		// The same retry ladder as Genius (D-070, D-049): LRCLIB names arrive
		// noisy however clean the catalogue being asked is.
		if (!hit || hit.score < MATCH_THRESHOLD) {
			const stripped = stripTitleNoise(title, artist);
			const candidates = stripped
				? [{ title: stripped, artist }, ...splitCandidates(title, artist)]
				: splitCandidates(title, artist);

			for (const candidate of candidates) {
				const retry = await attempt(candidate.title, candidate.artist);
				if (retry && retry.score > (hit?.score ?? 0)) hit = retry;
				if (hit && hit.score >= MATCH_THRESHOLD) break;
			}
		}

		if (!hit || hit.score < MATCH_THRESHOLD) return null;

		const images = pickImages(hit.track.album.images);
		if (!images) return null;

		return {
			...images,
			source: "spotify",
			// Carries the embed player (D-112) the way `geniusId` carries the
			// YouTube lookup: the id rides with the match that vouched for it.
			spotifyId: hit.track.id,
			matchScore: Number(hit.score.toFixed(3)),
		};
	} catch (error) {
		console.warn("[spotify] artwork lookup failed", error);
		return null;
	}
}
