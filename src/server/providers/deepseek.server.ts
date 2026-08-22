/**
 * DeepSeek adapter — the primary insight provider (D-050).
 *
 * Chosen over Gemini for one reason that outranks the rest: Gemini's free tier
 * caps at 20 requests a day, which made the drawer undeployable (OD-021). At
 * roughly $0.0006 an insight, DeepSeek turns a launch blocker into a rounding
 * error.
 *
 * The API is OpenAI-compatible, so this speaks the chat-completions dialect.
 * As with Gemini, REST directly rather than an SDK: one fewer dependency, and
 * runtime-agnostic, which D-009 requires while the deployment target is
 * undecided.
 */

import type { Insight } from "../../lib/types";
import { env } from "../env";
import {
	buildPrompt,
	type InsightRequest,
	type ModelOutput,
	toInsight,
} from "./insight";

const ENDPOINT = "https://api.deepseek.com/chat/completions";

/**
 * DeepSeek offers no schema enforcement — `response_format` accepts
 * `json_object` only, and rejects `json_schema` outright with "this
 * response_format type is unavailable now". So JSON validity is guaranteed by
 * the API and the SHAPE is carried in the prompt instead, then coerced and
 * gated in `toInsight`. Measured, that recovers conformance from 0/8 to 8/8.
 */
const RESPONSE_FORMAT = { type: "json_object" } as const;

/**
 * deepseek-v4-flash is a reasoning model, and its reasoning is the entire
 * latency story here: left on, it spent 2,700-7,600 reasoning tokens to
 * produce 100-190 words, taking a median 32s and a worst case of 59s. Turned
 * off, the same prompt lands in a median 5.4s for 0 reasoning tokens — and
 * every output gate still passed 8 times out of 8, because the thinking was
 * not buying correctness, only time.
 *
 * The task is why. There is nothing here to reason about: the song is in the
 * prompt, the sources are in the prompt, and the shape is dictated. This is a
 * writing job, and the model is a strong writer without deliberating first.
 *
 * `reasoning_effort: "minimal"` was measured too and is not a substitute —
 * 25s median, reasoning tokens barely moved.
 */
const THINKING = { type: "disabled" } as const;

/**
 * Four times the measured worst case (7.2s). The cost of being wrong is
 * asymmetric: a timeout throws away a complete answer the reader would have
 * accepted and spends the fallback, while a slow answer only extends a
 * shimmer nobody is watching.
 */
const TIMEOUT_MS = 30_000;

interface ChatResponse {
	choices?: Array<{ message?: { content?: string } }>;
	error?: { message?: string };
}

/**
 * Generate the synthesis. Returns null on any failure, which is the signal for
 * the caller to try the fallback provider (D-050).
 */
export async function generateInsight(
	args: InsightRequest,
): Promise<Insight | null> {
	if (!env.deepseekApiKey) return null;

	try {
		const response = await fetch(ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.deepseekApiKey}`,
			},
			body: JSON.stringify({
				model: env.deepseekModel,
				messages: [
					{ role: "user", content: buildPrompt(args, { describeShape: true }) },
				],
				response_format: RESPONSE_FORMAT,
				thinking: THINKING,
				temperature: 0.7,
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});

		const payload = (await response.json()) as ChatResponse;

		if (!response.ok || payload.error) {
			const detail = payload.error?.message ?? `status ${response.status}`;
			console.warn(`[deepseek] ${detail}`);
			if (response.status === 402) {
				console.warn(
					"[deepseek] account balance exhausted — top up or unset DEEPSEEK_API_KEY",
				);
			}
			return null;
		}

		const raw = payload.choices?.[0]?.message?.content;
		if (!raw) return null;

		return toInsight(JSON.parse(raw) as ModelOutput, args);
	} catch (error) {
		console.warn("[deepseek] synthesis failed", error);
		return null;
	}
}
