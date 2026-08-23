/**
 * Server functions — the boundary loaders call.
 *
 * Loaders are isomorphic (they run on client AND server), so anything touching
 * secrets or server-only state has to sit behind createServerFn. Nothing here
 * needs a key yet, but the Genius, LLM, and search integrations will.
 */

import { createServerFn } from "@tanstack/react-start";

import { normalisePreferences, type Preferences } from "../lib/deep-dives";

import { env } from "./env";

import { getInsight } from "./insights.server";
import {
	getTrack,
	getTrackPlayback,
	getTrackVisuals,
	searchLyrics,
} from "./lyrics.server";

export const getTrackFn = createServerFn({ method: "GET" })
	.validator((data: { id: string }) => {
		const id = String(data?.id ?? "").trim();
		if (!id) throw new Error("A track id is required");
		return { id };
	})
	.handler(({ data }) => getTrack(data.id));

/**
 * The public origin, for absolute URLs in head tags (D-051).
 *
 * A server function rather than `import.meta.env`, because this project keeps
 * every environment read behind `src/server/env.ts` (D-014). The value is not
 * secret — it is the site's own address — but a second, parallel mechanism for
 * reading configuration is a worse cost than one extra call on a client-side
 * navigation, where nothing is waiting on it anyway.
 *
 * Returns "" when unset, which leaves a relative og:image: wrong for a crawler,
 * but no worse than the alternative, and correct in local development.
 */
export const getSiteOriginFn = createServerFn({ method: "GET" }).handler(
	() => env.siteUrl ?? "",
);

export const searchLyricsFn = createServerFn({ method: "GET" })
	.validator((data: { q: string; limit?: number }) => ({
		q: String(data?.q ?? ""),
		limit: Math.min(Math.max(Number(data?.limit) || 8, 1), 20),
	}))
	.handler(({ data }) => searchLyrics(data.q, data.limit));

export const getTrackVisualsFn = createServerFn({ method: "GET" })
	.validator((data: { title: string; artist: string }) => ({
		title: String(data?.title ?? "").trim(),
		artist: String(data?.artist ?? "").trim(),
	}))
	.handler(({ data }) => getTrackVisuals(data.title, data.artist));

/**
 * Separate from the visuals so the two stream independently (D-055). The
 * artwork lands in about a second; this one takes three, and used to hold the
 * artwork hostage for the difference.
 */
export const getTrackPlaybackFn = createServerFn({ method: "GET" })
	.validator((data: { title: string; artist: string }) => ({
		title: String(data?.title ?? "").trim(),
		artist: String(data?.artist ?? "").trim(),
	}))
	.handler(({ data }) => getTrackPlayback(data.title, data.artist));

/**
 * Insights are requested on demand — the reader presses "Discover the Story"
 * (PRD §4) — so this is never called from a loader.
 */
export const getInsightFn = createServerFn({ method: "GET" })
	.validator((data: { id: string; preferences?: Preferences }) => ({
		id: String(data?.id ?? "").trim(),
		// Normalised here rather than trusted: this reaches a cache key, and
		// the drawer is the only caller that has answers to send (D-047).
		preferences: normalisePreferences(data?.preferences),
	}))
	.handler(async ({ data }) => {
		const track = await getTrack(data.id);
		if (!track) return null;
		return getInsight({
			title: track.title,
			artist: track.artist,
			stanzas: track.stanzas,
			preferences: data.preferences,
		});
	});
