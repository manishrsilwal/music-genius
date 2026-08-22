/**
 * Insights orchestration (PRD §4, Feature 2).
 *
 * Gathering sources and running an LLM takes several seconds, which is exactly
 * why this is a separate operation from the lyrics: the reader starts reading
 * immediately and the drawer fills in behind them (D-017, same pattern).
 */

import { cached, TTL } from "../lib/cache";
import { type Preferences, preferenceSignature } from "../lib/deep-dives";
import type { Insight, Stanza } from "../lib/types";
import { initCache } from "./cache/index.server";
import { env, features } from "./env";
import { generateInsight as generateWithDeepseek } from "./providers/deepseek.server";
import { generateInsight as generateWithGemini } from "./providers/gemini.server";
import type { InsightRequest } from "./providers/insight";
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
	preferences: Preferences;
}): Promise<Insight | null> {
	if (!features.insights) return null;

	const taste = preferenceSignature(args.preferences);

	// Bumped whenever the stored shape or the gating rules change. Entries live
	// for 30 days, so without this the reader would keep getting insights built
	// under the old rules — including quotes that predate the verbatim gate
	// (D-030) and sources with no thumbnail (D-031).
	//
	// The signature is part of the key because the personal slot is written to
	// the reader (D-047): two readers who answered differently must not share
	// an insight. Readers who answered the same still do, and everyone who
	// skipped the stepper shares the `none` entry — which is the common case
	// and the cheapest one.
	const key = `insight:v4:${taste}:${args.artist.toLowerCase()}::${args.title.toLowerCase()}`;

	return cached(key, INSIGHT_TTL, async () => {
		// Grounding first: the synthesis is materially better with sources, and
		// the quote is impossible without them.
		const { sources, excerpts } = await gatherSources(args.title, args.artist);

		return generate({
			title: args.title,
			artist: args.artist,
			lyrics: toPlainLyrics(args.stanzas),
			sources,
			excerpts,
			preferences: taste === "none" ? undefined : args.preferences,
		});
	});
}

/**
 * DeepSeek first, Gemini second (D-050).
 *
 * Both adapters return null for every failure they can have — no key, a bad
 * status, a timeout, unparseable JSON, or an answer that lost every gate — so
 * a single null check covers the whole fallback. Deliberately sequential
 * rather than raced: the fallback exists to cover an outage, and firing both
 * on every cold insight would double the cost and the token spend to save a
 * few seconds nobody is waiting on.
 *
 * When neither has a key configured, `features.insights` is already false and
 * this is never reached.
 */
async function generate(request: InsightRequest) {
	const primary = await generateWithDeepseek(request);
	if (primary) return primary;

	// Only worth reporting when DeepSeek was actually asked. A deployment that
	// only ever configured Gemini is not falling back, and should not be told
	// it is on every cold insight.
	if (env.deepseekApiKey) {
		console.warn("[insights] deepseek returned nothing — trying gemini");
	}
	return generateWithGemini(request);
}
