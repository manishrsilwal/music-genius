import { useQuery } from "@tanstack/react-query";

import type { Insight } from "@/lib/types";

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
	signal?: AbortSignal,
): Promise<Insight | null> {
	const response = await fetch(`/api/insights?id=${encodeURIComponent(id)}`, {
		signal,
	});

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
	const { data, isPending, isError } = useQuery({
		queryKey: ["insights", trackId],
		queryFn: ({ signal }) => fetchInsight(trackId, signal),
		staleTime: Number.POSITIVE_INFINITY,
		// The model is non-deterministic and slow; retrying a genuine failure
		// mostly wastes the reader's battery.
		retry: false,
	});

	if (isPending) return { state: "generating", insight: null };
	if (isError) return { state: "failed", insight: null };
	if (!data) return { state: "unavailable", insight: null };
	return { state: "ready", insight: data };
}
