import { useQuery } from "@tanstack/react-query";

import { type Preferences, preferenceSignature } from "@/lib/deep-dives";
import type { Insight } from "@/lib/types";

import { usePreferences } from "../../discovery/hooks/use-preferences";

/**
 * Insight generation (PRD §4, Feature 2).
 *
 * Starts on mount rather than on click. The PRD is explicit: the reader begins
 * reading immediately while the model works in the background, and the button
 * illuminates when the context is ready. Waiting for a click would put the full
 * 3–6s in front of the reader instead of behind them.
 */

export type InsightState = "unavailable" | "generating" | "ready" | "failed";

async function fetchInsight(
	id: string,
	preferences: Preferences,
	signal?: AbortSignal,
): Promise<Insight | null> {
	const params = new URLSearchParams({ id });
	// Only what was actually answered. Sending empty keys would make two
	// readers who both skipped the stepper look different to the cache.
	if (preferences.mood) params.set("mood", preferences.mood);
	if (preferences.pull) params.set("pull", preferences.pull);
	if (preferences.familiarity) {
		params.set("familiarity", preferences.familiarity);
	}

	const response = await fetch(`/api/insights?${params}`, { signal });

	// 501 means the deployment has no LLM configured. That is a capability
	// gap, not a failure — the button simply never appears.
	if (response.status === 501) return null;
	if (!response.ok) throw new Error("Insight generation failed");

	return response.json();
}

export function useInsights(trackId: string): {
	state: InsightState;
	insight: Insight | null;
} {
	// The drawer is written to this reader (D-047), so the answers are part of
	// the identity of the request — not an extra argument bolted onto it.
	const { preferences, answered } = usePreferences();

	const { data, isPending, isError } = useQuery({
		queryKey: ["insights", trackId, preferenceSignature(preferences)],
		queryFn: ({ signal }) => fetchInsight(trackId, preferences, signal),
		// `answered` is null until localStorage has been read. Firing before
		// then would spend a generation on the wrong reader and cache it.
		enabled: answered !== null,
		staleTime: Number.POSITIVE_INFINITY,
		// The model is non-deterministic and slow; retrying a genuine failure
		// mostly wastes the reader's battery.
		retry: false,
	});

	if (answered === null) return { state: "generating", insight: null };
	if (isPending) return { state: "generating", insight: null };
	if (isError) return { state: "failed", insight: null };
	if (!data) return { state: "unavailable", insight: null };
	return { state: "ready", insight: data };
}
