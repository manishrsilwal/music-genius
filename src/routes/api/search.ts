/**
 * GET /api/search?q=<query>&limit=<n>   (PRD §3.1)
 *
 * Backs the instant autocomplete. Kept as a real HTTP route because the search
 * field calls it per keystroke from the browser.
 */

import { createFileRoute } from "@tanstack/react-router";

import { TTL } from "@/lib/cache";
import { searchLyrics } from "@/server/lyrics.server";

export const Route = createFileRoute("/api/search")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const params = new URL(request.url).searchParams;
				const query = params.get("q")?.trim() ?? "";
				const limit = Math.min(
					Math.max(Number(params.get("limit")) || 8, 1),
					20,
				);

				if (query.length < 2) return Response.json([]);

				try {
					const results = await searchLyrics(query, limit);
					return Response.json(results, {
						headers: { "Cache-Control": `public, max-age=${TTL.search}` },
					});
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Upstream failure";
					return Response.json({ error: message }, { status: 502 });
				}
			},
		},
	},
});
