/**
 * Web grounding for the insights drawer (PRD §2, OD-004).
 *
 * Tavily is the configured provider; the shape here is deliberately generic so
 * swapping it is a change to this file alone.
 *
 * Grounding is optional but consequential: without it the synthesis is written
 * from the lyrics alone, and no quote is offered at all. See InsightQuote.
 */

import type { InsightSource } from "../../lib/types";
import { env, features } from "../env";
import { toVideoId } from "../genius.server";

const TAVILY = "https://api.tavily.com/search";

interface TavilyResult {
	title?: string;
	url?: string;
	content?: string;
	favicon?: string;
}

/**
 * Roughly a third of what Tavily returns for a song is a social-media stub —
 * a facebook or instagram page whose entire excerpt is 140 characters of
 * title and boilerplate. It cannot ground a quote, and listing it in the
 * Source Gallery claims it fed the synthesis when it did not. Over-fetch and
 * drop them rather than showing the reader a link to nothing.
 */
const MIN_EXCERPT = 250;

/** Over-fetch to absorb what MIN_EXCERPT removes. Still one Tavily search. */
const FETCH_COUNT = 8;

export interface GroundingResult {
	sources: InsightSource[];
	/** Raw excerpts handed to the model as evidence. */
	excerpts: string[];
}

const EMPTY: GroundingResult = { sources: [], excerpts: [] };

function classify(url: string): "article" | "video" {
	return /youtube\.com|youtu\.be|vimeo\.com/.test(url) ? "video" : "article";
}

/**
 * PRD §3.5 asks the gallery for "YouTube thumbnails or article headlines".
 * A video gets its real still, built from the id rather than fetched. An
 * article falls back to the site's favicon, which Tavily already returns —
 * a weaker visual, but it costs no extra request and gives each card an
 * anchor beside the headline.
 */
function thumbnailFor(url: string, favicon: string | undefined): string | null {
	const videoId = toVideoId(url);
	if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
	return favicon?.trim() || null;
}

/**
 * Gather what has been written about a song. Returns nothing on any failure —
 * the drawer degrades to an ungrounded synthesis rather than erroring.
 */
export async function gatherSources(
	title: string,
	artist: string,
): Promise<GroundingResult> {
	if (!features.grounding) return EMPTY;

	try {
		const response = await fetch(TAVILY, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.tavilyApiKey}`,
			},
			body: JSON.stringify({
				query: `"${title}" "${artist}" song meaning interview songwriter`,
				search_depth: "advanced",
				max_results: FETCH_COUNT,
				include_favicon: true,
			}),
			signal: AbortSignal.timeout(8000),
		});

		if (!response.ok) {
			console.warn(`[search] tavily responded ${response.status}`);
			return EMPTY;
		}

		const payload = (await response.json()) as { results?: TavilyResult[] };
		const results = (payload.results ?? []).filter(
			(r) => r.url && r.title && (r.content?.length ?? 0) >= MIN_EXCERPT,
		);

		return {
			sources: results.map((r) => ({
				title: String(r.title),
				url: String(r.url),
				kind: classify(String(r.url)),
				thumbnail: thumbnailFor(String(r.url), r.favicon),
			})),
			excerpts: results.map(
				(r, i) => `[${i}] ${r.title}\n${(r.content ?? "").slice(0, 1200)}`,
			),
		};
	} catch (error) {
		console.warn("[search] grounding failed", error);
		return EMPTY;
	}
}
