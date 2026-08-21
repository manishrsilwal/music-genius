/**
 * Server functions — the boundary loaders call.
 *
 * Loaders are isomorphic (they run on client AND server), so anything touching
 * secrets or server-only state has to sit behind createServerFn. Nothing here
 * needs a key yet, but the Genius, LLM, and search integrations will.
 */

import { createServerFn } from "@tanstack/react-start";

import { getTrack, searchLyrics } from "./lyrics.server";

export const getTrackFn = createServerFn({ method: "GET" })
	.validator((data: { id: string }) => {
		const id = String(data?.id ?? "").trim();
		if (!id) throw new Error("A track id is required");
		return { id };
	})
	.handler(({ data }) => getTrack(data.id));

export const searchLyricsFn = createServerFn({ method: "GET" })
	.validator((data: { q: string; limit?: number }) => ({
		q: String(data?.q ?? ""),
		limit: Math.min(Math.max(Number(data?.limit) || 8, 1), 20),
	}))
	.handler(({ data }) => searchLyrics(data.q, data.limit));
