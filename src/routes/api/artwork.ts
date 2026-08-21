/**
 * GET /api/artwork?title=&artist=   (PRD §3.1, §3.2)
 *
 * Artwork and palette, split out from /api/track so the words never wait on an
 * image (D-017). Autocomplete calls this per row; the track page streams it in
 * after the lyrics have already rendered.
 */

import { createFileRoute } from "@tanstack/react-router";

import { TTL } from "@/lib/cache";
import { getTrackVisuals } from "@/server/lyrics.server";

export const Route = createFileRoute("/api/artwork")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const params = new URL(request.url).searchParams;
				const title = params.get("title")?.trim() ?? "";
				const artist = params.get("artist")?.trim() ?? "";

				if (!title || !artist) {
					return Response.json(
						{ error: "Both `title` and `artist` are required" },
						{ status: 400 },
					);
				}

				try {
					const visuals = await getTrackVisuals(title, artist);
					return Response.json(visuals, {
						headers: { "Cache-Control": `public, max-age=${TTL.track}` },
					});
				} catch (error) {
					// A missing cover is never worth an error status to the caller.
					console.warn("[api/artwork] lookup failed", error);
					return Response.json({ artwork: null, palette: null });
				}
			},
		},
	},
});
