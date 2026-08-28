/**
 * Lyric-read mood tagging (D-121) — the one tagger both pipelines share.
 *
 * `retag-moods.ts` uses it to re-read the existing catalogue;
 * `expand-catalogue.ts` uses it so every future harvest arrives with moods
 * derived from the ACTUAL lyric text rather than the proposer's memory of
 * the song. One prompt, one vocabulary, one validator — two callers.
 */

import { fetchTrack } from "../src/lib/clients/lrclib";
import { type Mood, MOODS } from "../src/lib/deep-dives";
import { env } from "../src/server/env";

/**
 * The vocabulary as the model sees it. One line per mood, the same hints the
 * stepper shows the reader — tagger and reader must mean the same thing by
 * each word, or the match is a pun, not a promise.
 */
export const VOCABULARY = `- longing: distance, memory, ache for someone or somewhere out of reach
- defiant: anger with somewhere to go; refusal, resistance, spine
- tender: quiet, close, unguarded affection, spoken softly
- restless: motion, nerve, escape; cannot sit still
- heartbroken: the wound, still open — loss or betrayal felt NOW, not remembered
- joyful: lightness that means it; celebration without irony
- nostalgic: looking back, softly — the past remembered warmly rather than ached for`;

export interface MoodTags {
	mood: Mood;
	moodAlso: Mood | null;
	reason: string;
}

/** Flatten a track's stanzas to the plain text the tagger reads. */
export async function lyricsFor(id: string): Promise<string | null> {
	const track = await fetchTrack(id);
	if (!track) return null;
	const text = track.stanzas
		.map((stanza) => stanza.lines.map((line) => line.text).join("\n"))
		.join("\n\n")
		.trim();
	return text.length > 0 ? text : null;
}

/**
 * Ask the model to place one lyric in the vocabulary. Returns null when the
 * answer does not survive validation — callers fall back rather than trust.
 */
export async function tagMoods(
	title: string,
	artist: string,
	language: string,
	lyrics: string,
): Promise<MoodTags | null> {
	const prompt = `You are tagging one song for a catalogue of lyrics that reward close reading. Judge ONLY from the lyric text below — not from the melody, the production, or the song's reputation.

Song: "${title}" by ${artist} (${language})

Vocabulary — choose from EXACTLY these words:
${VOCABULARY}

Lyrics:
${lyrics.slice(0, 3500)}

Answer as JSON: {"mood": "<primary>", "moodAlso": "<secondary or null>", "reason": "<one line, from the lyrics>"}
- "mood": the register the lyric LEADS with.
- "moodAlso": a second register the lyric genuinely carries, or null. Never repeat the primary. Do not pad — most songs are one thing.`;

	const response = await fetch("https://api.deepseek.com/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.deepseekApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: env.deepseekModel,
			messages: [{ role: "user", content: prompt }],
			response_format: { type: "json_object" },
			// Low: tagging is a judgement call, not a creative one.
			temperature: 0.3,
		}),
	});
	if (!response.ok) {
		throw new Error(`DeepSeek ${response.status}: ${await response.text()}`);
	}
	const payload = (await response.json()) as {
		choices?: { message?: { content?: string } }[];
	};
	const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as {
		mood?: unknown;
		moodAlso?: unknown;
		reason?: unknown;
	};

	// The same enum discipline the app applies to everything untrusted.
	const mood =
		typeof parsed.mood === "string" &&
		(MOODS as readonly string[]).includes(parsed.mood)
			? (parsed.mood as Mood)
			: null;
	if (!mood) return null;
	const moodAlso =
		typeof parsed.moodAlso === "string" &&
		(MOODS as readonly string[]).includes(parsed.moodAlso) &&
		parsed.moodAlso !== mood
			? (parsed.moodAlso as Mood)
			: null;
	const reason =
		typeof parsed.reason === "string" ? parsed.reason.slice(0, 160) : "";
	return { mood, moodAlso, reason };
}
