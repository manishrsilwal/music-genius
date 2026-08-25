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
							// The 30 days belongs to caches we can reach, not the
							// reader's browser (D-087). This response's SHAPE has
							// changed twice (track:v2 -> v3), and the server bump
							// that fixed it cannot touch a copy a browser kept —
							// `immutable` for a month meant a returning reader
							// could feed month-old JSON to this week's code, and
							// only a hard refresh recovers. One hour locally;
							// CDNs get the month via s-maxage and are purged or
							// replaced on deploy.
							"Cache-Control": `public, max-age=3600, s-maxage=${TTL.track}`,
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
