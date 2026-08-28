/**
 * The feelings chat's shared logic (D-122).
 *
 * The chat replaced the stepper as the personalisation flow: the same four
 * questions, asked as a conversation, answered by tapping chips — plus a
 * free-text field for readers who would rather say it in their own words.
 *
 * Everything here is PURE and local. The AI half of the hybrid lives behind
 * `/api/interpret`; this module holds what must work without it — the
 * scripted spine, the offline keyword interpreter the client falls back to,
 * the merge rule, and the labels the confirmation bubble echoes. Every word
 * the bot speaks is WRITTEN, never generated (D-045's spirit): the model
 * only ever returns enums, and the sentences around them are ours.
 */

import {
	FAMILIARITY_OPTIONS,
	type Familiarity,
	LANGUAGE_OPTIONS,
	LANGUAGES,
	type Language,
	MOOD_OPTIONS,
	MOODS,
	type Mood,
	type Preferences,
	PULL_OPTIONS,
	type Pull,
} from "./deep-dives";

/**
 * What one message was heard to say. Axes the message did not speak to are
 * ABSENT, which is what lets a merge leave earlier answers alone — unlike
 * `Preferences`, where null means "no preference".
 */
export interface Heard {
	mood?: Mood;
	pull?: Pull;
	familiarity?: Familiarity;
	languages?: Language[];
}

/** The scripted spine: the stepper's four questions, in the same order. */
export const CHAT_STEPS = [
	{
		axis: "mood",
		question: "What do you want to sit with today?",
	},
	{
		axis: "pull",
		question: "What pulls you into a song?",
	},
	{
		axis: "familiarity",
		question: "How well should you know it?",
	},
	{
		axis: "languages",
		question: "What languages do you listen in?",
	},
] as const;

export type ChatAxis = (typeof CHAT_STEPS)[number]["axis"];

/*
 * The offline interpreter's vocabulary. Deliberately small and literal:
 * this is the FALLBACK when the AI reader is unreachable, not a rival to
 * it — a reader who says "sad" while offline should still land somewhere
 * true, and a reader who says something subtle gets the honest "I couldn't
 * quite catch that" rather than a wild guess.
 */
const MOOD_WORDS: Record<Mood, readonly string[]> = {
	longing: ["longing", "miss ", "missing", "yearn", "far away", "ache"],
	defiant: ["defiant", "angry", "anger", "rage", "fight", "unfair", "rebel"],
	tender: ["tender", "gentle", "soft", "warm", "in love", "close to"],
	restless: ["restless", "stuck", "escape", "run away", "can't sit", "wander"],
	heartbroken: [
		"sad",
		"heartbroke",
		"heartbreak",
		"breakup",
		"broke up",
		"broken heart",
		"crying",
		"cried",
		"hurt",
		"grief",
		"left me",
	],
	joyful: ["happy", "joy", "celebrate", "great day", "good mood", "dancing"],
	nostalgic: [
		"nostalgic",
		"nostalgia",
		"memories",
		"old days",
		"childhood",
		"used to",
		"back then",
	],
};

const PULL_WORDS: Record<Pull, readonly string[]> = {
	storytelling: ["story", "stories"],
	wordplay: ["wordplay", "clever", "rhyme", "witty"],
	confession: ["honest", "honesty", "confession", "raw"],
	imagery: ["imagery", "poetic", "poetry", "pictures"],
};

const FAMILIARITY_WORDS: Record<
	Exclude<Familiarity, "surprise">,
	readonly string[]
> = {
	canon: ["classic", "classics", "songs i know", "familiar"],
	deep: ["something new", "discover", "deep cuts", "don't know", "hidden"],
};

/**
 * Read a message with a keyword map — the local half of the hybrid (D-122).
 *
 * Mood picks the register with the MOST matching words (ties go to the
 * vocabulary's order, deterministically); languages collect every mention.
 * Returns an empty object when nothing matched, which the chat presents as
 * "I couldn't quite catch that" — a wrong guess would be worse than none.
 */
export function interpretLocally(message: string): Heard {
	const text = ` ${message.toLowerCase().trim()} `;
	const heard: Heard = {};

	let bestMood: Mood | null = null;
	let bestHits = 0;
	for (const mood of MOODS) {
		const hits = MOOD_WORDS[mood].filter((word) => text.includes(word)).length;
		if (hits > bestHits) {
			bestMood = mood;
			bestHits = hits;
		}
	}
	if (bestMood) heard.mood = bestMood;

	for (const pull of Object.keys(PULL_WORDS) as Pull[]) {
		if (PULL_WORDS[pull].some((word) => text.includes(word))) {
			heard.pull = pull;
			break;
		}
	}

	for (const familiarity of Object.keys(FAMILIARITY_WORDS) as Exclude<
		Familiarity,
		"surprise"
	>[]) {
		if (FAMILIARITY_WORDS[familiarity].some((word) => text.includes(word))) {
			heard.familiarity = familiarity;
			break;
		}
	}

	const languages = LANGUAGES.filter((language) => text.includes(language));
	if (languages.length > 0) heard.languages = [...languages];

	return heard;
}

/**
 * Coerce whatever the AI reader sent back into `Heard` — the same enum
 * discipline everything untrusted gets. Absent, null, junk: all simply
 * missing from the result.
 */
export function heardFromUntrusted(value: unknown): Heard {
	const raw = (value ?? {}) as Record<string, unknown>;
	const heard: Heard = {};
	const pick = <T extends string>(
		name: string,
		allowed: readonly T[],
	): T | undefined => {
		const candidate = raw[name];
		return typeof candidate === "string" &&
			(allowed as readonly string[]).includes(candidate)
			? (candidate as T)
			: undefined;
	};
	const mood = pick("mood", MOODS);
	if (mood) heard.mood = mood;
	const pull = pick("pull", PULLS_ALLOWED);
	if (pull) heard.pull = pull;
	const familiarity = pick("familiarity", FAMILIARITIES_ALLOWED);
	if (familiarity) heard.familiarity = familiarity;
	if (Array.isArray(raw.languages)) {
		const languages = [
			...new Set(
				raw.languages.filter(
					(entry): entry is Language =>
						typeof entry === "string" &&
						(LANGUAGES as readonly string[]).includes(entry),
				),
			),
		];
		if (languages.length > 0) heard.languages = languages;
	}
	return heard;
}

const PULLS_ALLOWED = PULL_OPTIONS.map((option) => option.value);
// "surprise" is a chip the reader can tap, but not something a message
// "clearly implies" — the interpreter never claims it.
const FAMILIARITIES_ALLOWED = FAMILIARITY_OPTIONS.filter(
	(option) => option.value !== "surprise",
).map((option) => option.value);

export function heardNothing(heard: Heard): boolean {
	return (
		!heard.mood &&
		!heard.pull &&
		!heard.familiarity &&
		(heard.languages ?? []).length === 0
	);
}

/**
 * Fold what was heard into the draft. Spoken axes win — the message is the
 * reader's LATEST word — and silent axes keep whatever was already chosen,
 * which is what lets "actually, something in Hindi" refine rather than
 * reset.
 */
export function mergeHeard(draft: Preferences, heard: Heard): Preferences {
	return {
		mood: heard.mood ?? draft.mood,
		pull: heard.pull ?? draft.pull,
		familiarity: heard.familiarity ?? draft.familiarity,
		languages: heard.languages ?? draft.languages ?? null,
	};
}

/**
 * The labels the confirmation bubble echoes — the reader's own vocabulary,
 * from the option lists, assembled by code. The bot's sentence around them
 * is written in the component; the model contributes only the enums.
 */
export function heardLabels(heard: Heard): string[] {
	const labels: string[] = [];
	if (heard.mood) {
		const option = MOOD_OPTIONS.find((entry) => entry.value === heard.mood);
		if (option) labels.push(option.label.toLowerCase());
	}
	if (heard.pull) {
		const option = PULL_OPTIONS.find((entry) => entry.value === heard.pull);
		if (option) labels.push(`drawn to ${option.label.toLowerCase()}`);
	}
	if (heard.familiarity) {
		const option = FAMILIARITY_OPTIONS.find(
			(entry) => entry.value === heard.familiarity,
		);
		if (option) labels.push(option.label.toLowerCase());
	}
	for (const language of heard.languages ?? []) {
		const option = LANGUAGE_OPTIONS.find((entry) => entry.value === language);
		if (option) labels.push(`in ${option.label}`);
	}
	return labels;
}
