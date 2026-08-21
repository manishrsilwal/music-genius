/**
 * Curated catalogue for Today's Deep Dives (PRD §3.1).
 *
 * Hand-picked rather than algorithmic: neither Genius nor LRCLIB exposes
 * trending data (Genius /charts returns 403 for a client access token), and
 * "Today's Deep Dives" reads as an editor's selection anyway.
 *
 * EVERY ENTRY IS VERIFIED to exist in LRCLIB with synced lyrics. Candidates
 * that did not resolve were dropped rather than shipped — a recommendation
 * that leads to a dead page is worse than one fewer recommendation.
 *
 * `lrclibId` is captured so a pick links straight to its track without a
 * search round-trip. It is a hint, not a guarantee: LRCLIB ids are per-upload,
 * so a removed upload falls back to searching by name.
 *
 * To extend: add entries, then re-run the verification described in
 * ARCHITECTURE.md D-026 before committing.
 */

export const MOODS = ["longing", "defiant", "tender", "restless"] as const;
export const LANGUAGES = ["english", "hindi"] as const;
export const ERAS = ["classic", "modern"] as const;

export type Mood = (typeof MOODS)[number];
export type Language = (typeof LANGUAGES)[number];
export type Era = (typeof ERAS)[number];

export interface Preferences {
	mood: Mood | null;
	language: Language | null;
	era: Era | null;
}

export interface CuratedTrack {
	title: string;
	artist: string;
	lrclibId: string;
	mood: Mood;
	language: Language;
	era: Era;
}

export const CATALOGUE: CuratedTrack[] = [
	{
		title: "Wish You Were Here",
		artist: "Pink Floyd",
		lrclibId: "33803465",
		mood: "longing",
		language: "english",
		era: "classic",
	},
	{
		title: "Lag Ja Gale",
		artist: "Lata Mangeshkar",
		lrclibId: "23658883",
		mood: "longing",
		language: "hindi",
		era: "classic",
	},
	{
		title: "In My Life",
		artist: "The Beatles",
		lrclibId: "36302255",
		mood: "longing",
		language: "english",
		era: "classic",
	},
	{
		title: "Tere Bina Zindagi Se",
		artist: "Kishore Kumar",
		lrclibId: "35243934",
		mood: "longing",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Nights",
		artist: "Frank Ocean",
		lrclibId: "31781093",
		mood: "longing",
		language: "english",
		era: "modern",
	},
	{
		title: "Choo Lo",
		artist: "The Local Train",
		lrclibId: "7036519",
		mood: "longing",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Motion Sickness",
		artist: "Phoebe Bridgers",
		lrclibId: "11570429",
		mood: "longing",
		language: "english",
		era: "modern",
	},
	{
		title: "Agar Tum Saath Ho",
		artist: "Arijit Singh",
		lrclibId: "33945230",
		mood: "longing",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Zombie",
		artist: "The Cranberries",
		lrclibId: "35051290",
		mood: "defiant",
		language: "english",
		era: "classic",
	},
	{
		title: "Fight the Power",
		artist: "Public Enemy",
		lrclibId: "37063910",
		mood: "defiant",
		language: "english",
		era: "classic",
	},
	{
		title: "Bohemian Rhapsody",
		artist: "Queen",
		lrclibId: "30585262",
		mood: "defiant",
		language: "english",
		era: "classic",
	},
	{
		title: "Alright",
		artist: "Kendrick Lamar",
		lrclibId: "9500955",
		mood: "defiant",
		language: "english",
		era: "modern",
	},
	{
		title: "Seven Nation Army",
		artist: "The White Stripes",
		lrclibId: "32223262",
		mood: "defiant",
		language: "english",
		era: "modern",
	},
	{
		title: "Yeh Jo Des Hai Tera",
		artist: "A.R. Rahman",
		lrclibId: "34798363",
		mood: "defiant",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Something",
		artist: "The Beatles",
		lrclibId: "36255521",
		mood: "tender",
		language: "english",
		era: "classic",
	},
	{
		title: "Wonderful Tonight",
		artist: "Eric Clapton",
		lrclibId: "15652449",
		mood: "tender",
		language: "english",
		era: "classic",
	},
	{
		title: "Kabhi Kabhie Mere Dil Mein",
		artist: "Mukesh",
		lrclibId: "8349033",
		mood: "tender",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Chura Liya Hai Tumne",
		artist: "Asha Bhosle",
		lrclibId: "33926738",
		mood: "tender",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Holocene",
		artist: "Bon Iver",
		lrclibId: "23555615",
		mood: "tender",
		language: "english",
		era: "modern",
	},
	{
		title: "First Day of My Life",
		artist: "Bright Eyes",
		lrclibId: "17585749",
		mood: "tender",
		language: "english",
		era: "modern",
	},
	{
		title: "Tum Se Hi",
		artist: "Mohit Chauhan",
		lrclibId: "34291699",
		mood: "tender",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Raabta",
		artist: "Arijit Singh",
		lrclibId: "35784288",
		mood: "tender",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Karma Police",
		artist: "Radiohead",
		lrclibId: "31503287",
		mood: "restless",
		language: "english",
		era: "classic",
	},
	{
		title: "Smells Like Teen Spirit",
		artist: "Nirvana",
		lrclibId: "31750367",
		mood: "restless",
		language: "english",
		era: "classic",
	},
	{
		title: "Once in a Lifetime",
		artist: "Talking Heads",
		lrclibId: "9228305",
		mood: "restless",
		language: "english",
		era: "classic",
	},
	{
		title: "Paranoid Android",
		artist: "Radiohead",
		lrclibId: "19998617",
		mood: "restless",
		language: "english",
		era: "classic",
	},
	{
		title: "Blinding Lights",
		artist: "The Weeknd",
		lrclibId: "36523298",
		mood: "restless",
		language: "english",
		era: "modern",
	},
	{
		title: "Redbone",
		artist: "Childish Gambino",
		lrclibId: "34264408",
		mood: "restless",
		language: "english",
		era: "modern",
	},
	{
		title: "Nadaan Parindey",
		artist: "Mohit Chauhan",
		lrclibId: "34060184",
		mood: "restless",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Ilahi",
		artist: "Arijit Singh",
		lrclibId: "35458952",
		mood: "restless",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Dil Se Re",
		artist: "A.R. Rahman",
		lrclibId: "33769880",
		mood: "restless",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Teardrop",
		artist: "Massive Attack",
		lrclibId: "27327276",
		mood: "longing",
		language: "english",
		era: "classic",
	},
	{
		title: "Creep",
		artist: "Radiohead",
		lrclibId: "27196790",
		mood: "longing",
		language: "english",
		era: "classic",
	},
	{
		title: "Kun Faya Kun",
		artist: "A.R. Rahman",
		lrclibId: "35218012",
		mood: "tender",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Ae Dil Hai Mushkil",
		artist: "Arijit Singh",
		lrclibId: "879427",
		mood: "longing",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Masakali",
		artist: "Mohit Chauhan",
		lrclibId: "34637618",
		mood: "tender",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Roobaroo",
		artist: "Naresh Iyer",
		lrclibId: "7912114",
		mood: "defiant",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Khwaja Mere Khwaja",
		artist: "A.R. Rahman",
		lrclibId: "37323926",
		mood: "tender",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Yeh Duniya Agar Mil Bhi Jaye",
		artist: "Mohammed Rafi",
		lrclibId: "31558586",
		mood: "defiant",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Jinhe Naaz Hai Hind Par",
		artist: "Mohammed Rafi",
		lrclibId: "33605922",
		mood: "defiant",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Mera Joota Hai Japani",
		artist: "Mukesh",
		lrclibId: "34787788",
		mood: "defiant",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Musafir Hoon Yaaron",
		artist: "Kishore Kumar",
		lrclibId: "18472648",
		mood: "restless",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Zindagi Ka Safar",
		artist: "Kishore Kumar",
		lrclibId: "23929923",
		mood: "restless",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Aane Wala Pal",
		artist: "Kishore Kumar",
		lrclibId: "37924734",
		mood: "restless",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Main Pal Do Pal Ka Shayar",
		artist: "Mukesh",
		lrclibId: "22267656",
		mood: "restless",
		language: "hindi",
		era: "classic",
	},
];

/** How many picks the landing page shows (PRD §3.1 suggests three). */
export const DEEP_DIVE_COUNT = 3;

/**
 * Score a track against stated preferences.
 *
 * Partial credit rather than filtering: someone who picks "longing / hindi /
 * classic" should still see a strong longing track if that exact cell is thin,
 * instead of an empty shelf. Mood is weighted highest because it is what the
 * reader actually came in saying.
 */
function score(track: CuratedTrack, preferences: Preferences): number {
	let total = 0;
	if (preferences.mood && track.mood === preferences.mood) total += 3;
	if (preferences.language && track.language === preferences.language)
		total += 2;
	if (preferences.era && track.era === preferences.era) total += 1;
	return total;
}

/**
 * Deterministic shuffle from a seed, so every visitor sees the same picks on a
 * given day and they rotate at midnight — no cron, no stored state.
 */
function seededOrder(length: number, seed: number): number[] {
	const indices = [...Array(length).keys()];
	let state = seed || 1;
	for (let i = length - 1; i > 0; i--) {
		// xorshift; any decent PRNG would do, this one needs no dependency.
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		const j = Math.abs(state) % (i + 1);
		[indices[i], indices[j]] = [indices[j] as number, indices[i] as number];
	}
	return indices;
}

/** `2026-08-22` → a stable integer, so picks change once a day. */
export function seedFromDate(date: string): number {
	let hash = 0;
	for (const char of date) hash = (hash * 31 + char.charCodeAt(0)) | 0;
	return hash;
}

/**
 * Pick the day's Deep Dives.
 *
 * With no preferences this is simply the day's rotation, which is what a first
 * visitor who skipped the stepper should see.
 */
export function pickDeepDives(
	preferences: Preferences,
	seed: number,
	count = DEEP_DIVE_COUNT,
): CuratedTrack[] {
	const order = seededOrder(CATALOGUE.length, seed);

	return order
		.map((index) => CATALOGUE[index] as CuratedTrack)
		.map((track, position) => ({
			track,
			// Position breaks ties, keeping the daily rotation visible even when
			// several tracks score identically.
			rank: score(track, preferences) * 1000 - position,
		}))
		.sort((a, b) => b.rank - a.rank)
		.slice(0, count)
		.map((entry) => entry.track);
}
