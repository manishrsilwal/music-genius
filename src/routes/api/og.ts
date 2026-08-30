/**
 * GET /api/og?trackId=…   (D-051)
 *
 * The social card for a track page. Separate from `/api/card` because the two
 * answer different questions: that one renders lines the reader chose and is
 * POST because a six-line verse does not fit in a URL, while this one renders
 * a link preview from an id a crawler found in a meta tag — and a crawler only
 * ever issues a GET.
 *
 * Sharing the renderer means the preview is the same object as the export,
 * which is the point: the card IS the product's argument.
 */

import { createFileRoute } from "@tanstack/react-router";

import { MAX_LINES, themeById } from "@/lib/card";
import { previewLines } from "@/lib/lrc";
import { renderCard } from "@/server/card.server";
import { getTrack, getTrackVisuals } from "@/server/lyrics.server";

/** Four lines previews better than six — a crawler renders it small. */
const PREVIEW_LINES = Math.min(4, MAX_LINES);

export const Route = createFileRoute("/api/og")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const params = new URL(request.url).searchParams;

				// The party invitation's card (D-117). A room link is the
				// feature's whole distribution mechanism, and it previewed as a
				// bare URL. Same renderer as every other card — deliberately
				// track-agnostic, so one CDN-cached image serves every invite
				// and a room id never leaks into a crawler's fetch.
				if (params.get("card") === "party") {
					try {
						const png = await renderCard({
							lines: ["One queue, one clock —", "everyone reads along."],
							title: "You're invited to a listen party",
							artist: "Refrain",
							theme: themeById(null, "dusk"),
						});
						return new Response(png as unknown as BodyInit, {
							headers: {
								"Content-Type": "image/png",
								"Cache-Control":
									"public, max-age=86400, s-maxage=604800, immutable",
							},
						});
					} catch (error) {
						console.warn("[api/og] party card failed", error);
						return new Response("Could not render the card", {
							status: 500,
						});
					}
				}

				const trackId = params.get("trackId");
				if (!trackId) {
					return Response.json(
						{ error: "trackId is required" },
						{ status: 400 },
					);
				}

				try {
					const track = await getTrack(trackId);
					if (!track) return new Response("Not found", { status: 404 });

					// The opening of the song, which is what a reader recognises.
					// Flattened across stanzas so a track whose first stanza is a
					// single line still fills the card.
					const lines = previewLines(track.stanzas, PREVIEW_LINES);

					if (lines.length === 0) {
						return new Response("Nothing to render", { status: 404 });
					}

					// Visuals are cached alongside the track, so this is a lookup
					// rather than a second round trip in the common case.
					const { palette } = await getTrackVisuals(track.title, track.artist);

					const png = await renderCard({
						lines,
						title: track.title.slice(0, 80),
						artist: track.artist.slice(0, 80),
						theme: themeById(palette, "dusk"),
					});

					return new Response(png as unknown as BodyInit, {
						headers: {
							"Content-Type": "image/png",
							// Long and immutable: the card is a pure function of a
							// track id, and crawlers refetch far more often than the
							// lyrics change. `public` because this is exactly the
							// response a CDN should be holding.
							"Cache-Control":
								"public, max-age=86400, s-maxage=604800, immutable",
						},
					});
				} catch (error) {
					console.warn("[api/og] render failed", error);
					return new Response("Could not render the card", { status: 500 });
				}
			},
		},
	},
});
