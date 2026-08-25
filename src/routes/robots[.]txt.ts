/**
 * GET /robots.txt   (D-053)
 *
 * A route rather than a static file because the `Sitemap:` directive must be an
 * absolute URL — the spec has no notion of resolving it against the host, and
 * a relative path is simply ignored. Same trap as og:image (D-051): the tag
 * looks right in the source and does nothing in the wild.
 */

import { createFileRoute } from "@tanstack/react-router";

import { env } from "@/server/env";

export const Route = createFileRoute("/robots.txt")({
	server: {
		handlers: {
			GET: () => {
				const origin = env.siteUrl;

				const body = `# Lyrical Explorer

User-agent: *
Allow: /
Allow: /track/

# Rendering endpoints, not pages. Crawling them costs a Satori rasterise or an
# upstream round trip per hit and returns nothing indexable. /api/og stays
# crawlable: social scrapers must fetch it to build a link preview.
Disallow: /api/search
Disallow: /api/track
Disallow: /api/artwork
Disallow: /api/insights
Disallow: /api/card
${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : "\n# Sitemap omitted: SITE_URL is not configured, and a relative one is ignored.\n"}`;

				return new Response(body, {
					headers: {
						"Content-Type": "text/plain; charset=utf-8",
						"Cache-Control": "public, max-age=3600",
					},
				});
			},
		},
	},
});
