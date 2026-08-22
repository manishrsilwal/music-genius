/**
 * Gemini adapter — the fallback insight provider (D-050).
 *
 * Was primary until DeepSeek replaced it; kept because it fails differently.
 * DeepSeek is one company's single region, and the drawer going quiet for a
 * day is a visible hole in the product, so a second provider on an unrelated
 * network is worth the small cost of maintaining one more adapter. It is only
 * ever reached when DeepSeek returns nothing.
 *
 * Uses the REST API directly rather than the SDK: one fewer dependency, and it
 * stays runtime-agnostic, which D-009 requires while the deployment target is
 * undecided.
 */

import type { Insight } from "../../lib/types";
import { env } from "../env";
import {
	buildPrompt,
	type InsightRequest,
	type ModelOutput,
	RESPONSE_SCHEMA,
	toInsight,
} from "./insight";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
	candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	error?: { message?: string; code?: number };
}

/**
 * Generate the synthesis. Returns null on any failure — with no provider left
 * to try, the drawer treats that as "unavailable" rather than surfacing an
 * error to the reader.
 */
export async function generateInsight(
	args: InsightRequest,
): Promise<Insight | null> {
	if (!env.geminiApiKey) return null;

	try {
		const response = await fetch(`${BASE}/${env.geminiModel}:generateContent`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-goog-api-key": env.geminiApiKey,
			},
			body: JSON.stringify({
				// The schema is enforced by the API here, so the prompt does not
				// restate it — that is only for providers without one (D-050).
				contents: [
					{
						parts: [{ text: buildPrompt(args, { describeShape: false }) }],
					},
				],
				generationConfig: {
					responseMimeType: "application/json",
					responseSchema: RESPONSE_SCHEMA,
					temperature: 0.7,
				},
			}),
			// PRD §4 budgets 3–6s for this; the drawer is progressive, so a
			// slow answer costs nothing but a longer shimmer.
			signal: AbortSignal.timeout(25_000),
		});

		const payload = (await response.json()) as GeminiResponse;

		if (!response.ok || payload.error) {
			const detail = payload.error?.message ?? `status ${response.status}`;
			console.warn(`[gemini] ${detail}`);
			if (response.status === 404) {
				console.warn(
					`[gemini] model "${env.geminiModel}" not found — set GEMINI_MODEL to a current one`,
				);
			}
			return null;
		}

		const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!raw) return null;

		return toInsight(JSON.parse(raw) as ModelOutput, args);
	} catch (error) {
		console.warn("[gemini] synthesis failed", error);
		return null;
	}
}
