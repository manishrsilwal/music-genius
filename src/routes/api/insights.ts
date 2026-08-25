/**
 * GET /api/insights?id=<track id>   (PRD §4, Feature 2)
 *
 * Deliberately separate from /api/track: this takes seconds, and the lyrics
 * must never wait on it.
 */

import { createFileRoute } from "@tanstack/react-router";

import { TTL } from "@/lib/cache";
import { parsePreferences } from "@/lib/deep-dives";
import { features } from "@/server/env";
import { getInsight } from "@/server/insights.server";
import { getTrack } from "@/server/lyrics.server";

export const Route = createFileRoute("/api/insights")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const id = url.searchParams.get("id")?.trim();
				if (!id) {
					return Response.json(
						{ error: "Missing `id` parameter" },
						{ status: 400 },
					);
				}

				// 501 rather than 500: nothing is broken, the capability simply
				// is not configured on this deployment.
				if (!features.insights) {
					return Response.json(
						{ error: "Insights are not configured" },
						{ status: 501 },
					);
				}

				try {
					const track = await getTrack(id);
					if (!track) {
						return Response.json({ error: "Track not found" }, { status: 404 });
					}

					const insight = await getInsight({
						title: track.title,
						artist: track.artist,
						stanzas: track.stanzas,
						// Validated against the enums, never taken as given: this
						// reaches a cache key, and an unbounded value would let a
						// caller mint entries against a 20-a-day quota (D-047).
						preferences: parsePreferences(url.searchParams),
					});

					if (!insight) {
						return Response.json(
							{ error: "Could not generate insights" },
							{ status: 502 },
						);
					}

					return Response.json(insight, {
						// Browser one hour, shared caches the month (D-087): the
						// insight's shape follows the drawer's design, and a
						// browser-held copy outliving a redesign is unfixable
						// from here.
						headers: {
							"Cache-Control": `public, max-age=3600, s-maxage=${TTL.track}`,
						},
					});
				} catch (error) {
					console.warn("[api/insights] failed", error);
					return Response.json(
						{ error: "Could not generate insights" },
						{ status: 502 },
					);
				}
			},
		},
	},
});
