/**
 * GET /sitemap.xml   (D-053)
 *
 * Lists the curated catalogue only — the 56 tracks in `deep-dives.ts` — and
 * not every track LRCLIB holds, which is millions of records this product does
 * not own and has no business claiming as its own pages.
 *
 * These are the tracks the product actually stands behind: hand-picked, each
 * carrying an editorial note, and the ones a cold visitor is shown first.
 */

import { createFileRoute } from "@tanstack/react-router";

import { CATALOGUE } from "@/lib/deep-dives";
import { env } from "@/server/env";

/** XML has five predefined entities; a title with an ampersand breaks the feed. */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: () => {
				const origin = env.siteUrl ?? "";

				const urls = [
					`${origin}/`,
					...CATALOGUE.map((track) => `${origin}/track/${track.lrclibId}`),
				];

				const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}
</urlset>`;

				return new Response(body, {
					headers: {
						"Content-Type": "application/xml; charset=utf-8",
						// The catalogue is edited by hand, so it changes on deploy
						// and never between them.
						"Cache-Control": "public, max-age=3600",
					},
				});
			},
		},
	},
});
