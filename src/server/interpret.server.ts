/**
 * The AI half of the feelings chat (D-122).
 *
 * One job: turn a typed feeling into enums. The model NEVER writes anything
 * the reader sees — the chat's sentences are written in the component, and
 * the confirmation step means nothing filters until the reader agrees. The
 * model proposes, code validates, the reader blesses: the same contract the
 * catalogue pipeline runs on, applied at the reader's level.
 *
 * DeepSeek for the same reasons as the insight drawer (D-050): cheap enough
 * to be a rounding error, OpenAI-compatible REST, no SDK. Thinking disabled
 * for the same reason too — there is nothing to deliberate; the vocabulary
 * is in the prompt. Unlike the drawer, the reader is WATCHING this wait, so
 * the timeout is short and failure is quiet: the client falls back to its
 * local keyword reader.
 */

import { getCache } from "@/lib/cache";
import { MOODS } from "@/lib/deep-dives";
import { type Heard, heardFromUntrusted, heardNothing } from "@/lib/feelings";

import { env } from "./env";

const ENDPOINT = "https://api.deepseek.com/chat/completions";
const TIMEOUT_MS = 10_000;

/** Server-side cap; the client caps too, but the client is not trusted. */
export const MESSAGE_LIMIT = 400;

export class InterpretError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
	}
}

/**
 * Fixed-window per-IP counter, same shape as the party's (D-117). Tighter
 * than any of the party's buckets: every call is a metered model request,
 * and a conversation is a handful of messages, not a stream.
 */
const LIMIT = { limit: 20, windowS: 600 };

export async function assertInterpretWithinLimit(
	ip: string | null,
): Promise<void> {
	const bucket = Math.floor(Date.now() / (LIMIT.windowS * 1000));
	const key = `interpret:rl:${ip ?? "unknown"}:${bucket}`;
	const count = (await getCache().get<number>(key)) ?? 0;
	if (count >= LIMIT.limit) {
		throw new InterpretError("Slow down a moment — too many messages", 429);
	}
	await getCache().set(key, count + 1, LIMIT.windowS);
}

function buildPrompt(message: string): string {
	return `A reader of a lyrics-reading app typed how they feel. Extract their listening preferences.

Message: ${JSON.stringify(message)}

Answer as JSON with these keys, using null for any axis the message does not CLEARLY imply. Do not guess.
- "mood": the emotional register they want to sit with. One of: ${MOODS.join(" | ")}. "sad" and heartbreak words mean heartbroken; missing someone means longing; remembering the past warmly means nostalgic.
- "pull": what they want from lyrics, only if stated. One of: storytelling | wordplay | confession | imagery.
- "familiarity": "canon" only if they ask for classics/known songs, "deep" only if they ask to discover lesser-known ones.
- "languages": array of any of ${["english", "hindi", "nepali", "punjabi", "tamil", "spanish", "korean"].join(" | ")} the message NAMES, or is written in — EXCEPT english: english is this app's interface language, so a message merely written in English implies nothing; include "english" only when the message explicitly asks for English songs.

Example: {"mood": "heartbroken", "pull": null, "familiarity": null, "languages": ["hindi"]}`;
}

interface ChatResponse {
	choices?: Array<{ message?: { content?: string } }>;
	error?: { message?: string };
}

/**
 * Read one message. Returns null whenever nothing trustworthy came back —
 * no key, timeout, junk shape, or a message that named no axis — and the
 * client's local reader takes over from there.
 */
export async function interpretFeelings(
	message: string,
): Promise<Heard | null> {
	if (!env.deepseekApiKey) return null;
	const trimmed = message.trim().slice(0, MESSAGE_LIMIT);
	if (trimmed.length < 2) return null;

	try {
		const response = await fetch(ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.deepseekApiKey}`,
			},
			body: JSON.stringify({
				model: env.deepseekModel,
				messages: [{ role: "user", content: buildPrompt(trimmed) }],
				response_format: { type: "json_object" },
				thinking: { type: "disabled" },
				// Near-zero: extraction is a reading test, not a writing one.
				temperature: 0.1,
			}),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});

		const payload = (await response.json()) as ChatResponse;
		if (!response.ok || payload.error) {
			console.warn(
				`[interpret] ${payload.error?.message ?? `status ${response.status}`}`,
			);
			return null;
		}

		const raw = payload.choices?.[0]?.message?.content;
		if (!raw) return null;

		const heard = heardFromUntrusted(JSON.parse(raw));
		return heardNothing(heard) ? null : heard;
	} catch (error) {
		console.warn("[interpret] failed", error);
		return null;
	}
}
