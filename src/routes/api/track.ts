/**
 * GET /api/track?id=<lrclib id>   (PRD §4, Feature 1)
 *
 * The HTTP contract. SSR does NOT come through here — loaders call the server
 * function directly. This exists for client-side callers and anything external.
 */

import { createFileRoute } from "@tanstack/react-router";

import { TTL } from "@/lib/cache";
import { getTrack } from "@/server/lyrics.server";

export const Route = createFileRoute("/api/track")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const id = new URL(request.url).searchParams.get("id")?.trim();
				if (!id) {
					return Response.json(
						{ error: "Missing `id` parameter" },
						{ status: 400 },
					);
				}

				try {
					const track = await getTrack(id);
					if (!track) {
						return Response.json({ error: "Track not found" }, { status: 404 });
					}

					return Response.json(track, {
						headers: {
							// Lyrics don't change. Let every layer in front of us cache too.
							"Cache-Control": `public, max-age=${TTL.track}, immutable`,
						},
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
