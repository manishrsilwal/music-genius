/**
 * Insights orchestration (PRD §4, Feature 2).
 *
 * Gathering sources and running an LLM takes several seconds, which is exactly
 * why this is a separate operation from the lyrics: the reader starts reading
 * immediately and the drawer fills in behind them (D-017, same pattern).
 */

import { cached, TTL } from "../lib/cache";
import type { Insight, Stanza } from "../lib/types";
import { initCache } from "./cache/index.server";
import { features } from "./env";
import { generateInsight } from "./providers/gemini.server";
import { gatherSources } from "./providers/search.server";

// Select the cache backend before any read-through runs (OD-001).
initCache();

/** Insights are expensive and stable; hold them as long as the lyrics. */
const INSIGHT_TTL = TTL.track;

/** Flatten stanzas back to plain text for the model. */
function toPlainLyrics(stanzas: Stanza[]): string {
	return stanzas
		.map((stanza) => stanza.lines.map((line) => line.text).join("\n"))
		.join("\n\n");
}

export async function getInsight(args: {
	title: string;
	artist: string;
	stanzas: Stanza[];
}): Promise<Insight | null> {
	if (!features.insights) return null;

	const key = `insight:${args.artist.toLowerCase()}::${args.title.toLowerCase()}`;

	return cached(key, INSIGHT_TTL, async () => {
		// Grounding first: the synthesis is materially better with sources, and
		// the quote is impossible without them.
		const { sources, excerpts } = await gatherSources(args.title, args.artist);

		return generateInsight({
			title: args.title,
			artist: args.artist,
			lyrics: toPlainLyrics(args.stanzas),
			sources,
			excerpts,
		});
	});
}
