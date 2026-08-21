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
 * To extend: add entries, confirm each resolves in LRCLIB with synced lyrics,
 * and check the cell-coverage tests still pass.
 */

export const MOODS = ["longing", "defiant", "tender", "restless"] as const;
export const PULLS = [
	"storytelling",
	"wordplay",
	"confession",
	"imagery",
] as const;
export const FAMILIARITIES = ["canon", "deep", "surprise"] as const;

export type Mood = (typeof MOODS)[number];
export type Pull = (typeof PULLS)[number];
export type Familiarity = (typeof FAMILIARITIES)[number];

/** Language and era are still recorded, but deliberately NOT scored — see D-027. */
export type Language = "english" | "hindi";
export type Era = "classic" | "modern";

export interface Preferences {
	/**
	 * Single-select, like every other axis. Multi-select was tried and removed:
	 * it was the only step that could not advance on tap, so it needed a
	 * Continue button that the other two made look like friction (D-032).
	 */
	mood: Mood | null;
	pull: Pull | null;
	familiarity: Familiarity | null;
}

export interface CuratedTrack {
	title: string;
	artist: string;
	lrclibId: string;
	mood: Mood;
	pull: Pull;
	familiarity: Exclude<Familiarity, "surprise">;
	language: Language;
	era: Era;
}

export const CATALOGUE: CuratedTrack[] = [
	{
		title: "Wish You Were Here",
		artist: "Pink Floyd",
		lrclibId: "33803465",
		mood: "longing",
		pull: "imagery",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Lag Ja Gale",
		artist: "Lata Mangeshkar",
		lrclibId: "23658883",
		mood: "longing",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "In My Life",
		artist: "The Beatles",
		lrclibId: "36302255",
		mood: "longing",
		pull: "confession",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Tere Bina Zindagi Se",
		artist: "Kishore Kumar",
		lrclibId: "35243934",
		mood: "longing",
		pull: "storytelling",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Nights",
		artist: "Frank Ocean",
		lrclibId: "31781093",
		mood: "longing",
		pull: "confession",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Choo Lo",
		artist: "The Local Train",
		lrclibId: "7036519",
		mood: "longing",
		pull: "confession",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Motion Sickness",
		artist: "Phoebe Bridgers",
		lrclibId: "11570429",
		mood: "longing",
		pull: "confession",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Agar Tum Saath Ho",
		artist: "Arijit Singh",
		lrclibId: "33945230",
		mood: "longing",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Zombie",
		artist: "The Cranberries",
		lrclibId: "35051290",
		mood: "defiant",
		pull: "storytelling",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Fight the Power",
		artist: "Public Enemy",
		lrclibId: "37063910",
		mood: "defiant",
		pull: "wordplay",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Bohemian Rhapsody",
		artist: "Queen",
		lrclibId: "30585262",
		mood: "defiant",
		pull: "storytelling",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Alright",
		artist: "Kendrick Lamar",
		lrclibId: "9500955",
		mood: "defiant",
		pull: "wordplay",
		familiarity: "canon",
		language: "english",
		era: "modern",
	},
	{
		title: "Seven Nation Army",
		artist: "The White Stripes",
		lrclibId: "32223262",
		mood: "defiant",
		pull: "storytelling",
		familiarity: "canon",
		language: "english",
		era: "modern",
	},
	{
		title: "Yeh Jo Des Hai Tera",
		artist: "A.R. Rahman",
		lrclibId: "34798363",
		mood: "defiant",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Something",
		artist: "The Beatles",
		lrclibId: "36255521",
		mood: "tender",
		pull: "confession",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Wonderful Tonight",
		artist: "Eric Clapton",
		lrclibId: "15652449",
		mood: "tender",
		pull: "storytelling",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Kabhi Kabhie Mere Dil Mein",
		artist: "Mukesh",
		lrclibId: "8349033",
		mood: "tender",
		pull: "imagery",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Chura Liya Hai Tumne",
		artist: "Asha Bhosle",
		lrclibId: "33926738",
		mood: "tender",
		pull: "storytelling",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Holocene",
		artist: "Bon Iver",
		lrclibId: "23555615",
		mood: "tender",
		pull: "imagery",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "First Day of My Life",
		artist: "Bright Eyes",
		lrclibId: "17585749",
		mood: "tender",
		pull: "confession",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Tum Se Hi",
		artist: "Mohit Chauhan",
		lrclibId: "34291699",
		mood: "tender",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Raabta",
		artist: "Arijit Singh",
		lrclibId: "35784288",
		mood: "tender",
		pull: "imagery",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Karma Police",
		artist: "Radiohead",
		lrclibId: "31503287",
		mood: "restless",
		pull: "imagery",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Smells Like Teen Spirit",
		artist: "Nirvana",
		lrclibId: "31750367",
		mood: "restless",
		pull: "wordplay",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Once in a Lifetime",
		artist: "Talking Heads",
		lrclibId: "9228305",
		mood: "restless",
		pull: "wordplay",
		familiarity: "deep",
		language: "english",
		era: "classic",
	},
	{
		title: "Paranoid Android",
		artist: "Radiohead",
		lrclibId: "19998617",
		mood: "restless",
		pull: "imagery",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Blinding Lights",
		artist: "The Weeknd",
		lrclibId: "36523298",
		mood: "restless",
		pull: "confession",
		familiarity: "canon",
		language: "english",
		era: "modern",
	},
	{
		title: "Redbone",
		artist: "Childish Gambino",
		lrclibId: "34264408",
		mood: "restless",
		pull: "imagery",
		familiarity: "canon",
		language: "english",
		era: "modern",
	},
	{
		title: "Nadaan Parindey",
		artist: "Mohit Chauhan",
		lrclibId: "34060184",
		mood: "restless",
		pull: "storytelling",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Ilahi",
		artist: "Arijit Singh",
		lrclibId: "35458952",
		mood: "restless",
		pull: "storytelling",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Dil Se Re",
		artist: "A.R. Rahman",
		lrclibId: "33769880",
		mood: "restless",
		pull: "imagery",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Teardrop",
		artist: "Massive Attack",
		lrclibId: "27327276",
		mood: "longing",
		pull: "imagery",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Creep",
		artist: "Radiohead",
		lrclibId: "27196790",
		mood: "longing",
		pull: "confession",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Kun Faya Kun",
		artist: "A.R. Rahman",
		lrclibId: "35218012",
		mood: "tender",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Ae Dil Hai Mushkil",
		artist: "Arijit Singh",
		lrclibId: "879427",
		mood: "longing",
		pull: "wordplay",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Masakali",
		artist: "Mohit Chauhan",
		lrclibId: "34637618",
		mood: "tender",
		pull: "wordplay",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Roobaroo",
		artist: "Naresh Iyer",
		lrclibId: "7912114",
		mood: "defiant",
		pull: "imagery",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Khwaja Mere Khwaja",
		artist: "A.R. Rahman",
		lrclibId: "37323926",
		mood: "tender",
		pull: "imagery",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Yeh Duniya Agar Mil Bhi Jaye",
		artist: "Mohammed Rafi",
		lrclibId: "31558586",
		mood: "defiant",
		pull: "imagery",
		familiarity: "deep",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Jinhe Naaz Hai Hind Par",
		artist: "Mohammed Rafi",
		lrclibId: "33605922",
		mood: "defiant",
		pull: "imagery",
		familiarity: "deep",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Mera Joota Hai Japani",
		artist: "Mukesh",
		lrclibId: "34787788",
		mood: "defiant",
		pull: "wordplay",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Musafir Hoon Yaaron",
		artist: "Kishore Kumar",
		lrclibId: "18472648",
		mood: "restless",
		pull: "storytelling",
		familiarity: "deep",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Zindagi Ka Safar",
		artist: "Kishore Kumar",
		lrclibId: "23929923",
		mood: "restless",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Aane Wala Pal",
		artist: "Kishore Kumar",
		lrclibId: "37924734",
		mood: "restless",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Main Pal Do Pal Ka Shayar",
		artist: "Mukesh",
		lrclibId: "22267656",
		mood: "restless",
		pull: "confession",
		familiarity: "deep",
		language: "hindi",
		era: "classic",
	},
	{
		title: "The Night We Met",
		artist: "Lord Huron",
		lrclibId: "34481607",
		mood: "longing",
		pull: "confession",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Re: Stacks",
		artist: "Bon Iver",
		lrclibId: "22660720",
		mood: "longing",
		pull: "imagery",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Casimir Pulaski Day",
		artist: "Sufjan Stevens",
		lrclibId: "16990543",
		mood: "tender",
		pull: "storytelling",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "A Case of You",
		artist: "Joni Mitchell",
		lrclibId: "12937387",
		mood: "longing",
		pull: "imagery",
		familiarity: "deep",
		language: "english",
		era: "classic",
	},
	{
		title: "Pyramid Song",
		artist: "Radiohead",
		lrclibId: "25112927",
		mood: "restless",
		pull: "imagery",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "The Trapeze Swinger",
		artist: "Iron and Wine",
		lrclibId: "30010199",
		mood: "longing",
		pull: "storytelling",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Phir Le Aya Dil",
		artist: "Arijit Singh",
		lrclibId: "6827664",
		mood: "longing",
		pull: "imagery",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Iktara",
		artist: "Kavita Seth",
		lrclibId: "36067000",
		mood: "tender",
		pull: "imagery",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Naina Da Kya Kasoor",
		artist: "Amit Trivedi",
		lrclibId: "5452480",
		mood: "restless",
		pull: "wordplay",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Aaoge Jab Tum",
		artist: "Ustad Rashid Khan",
		lrclibId: "21638733",
		mood: "tender",
		pull: "confession",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Zinda",
		artist: "Siddharth Mahadevan",
		lrclibId: "9211620",
		mood: "defiant",
		pull: "confession",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
];

/** The headline shelf (PRD §3.1 suggests three). */
export const DEEP_DIVE_COUNT = 3;
/** The longer "People also like" shelf beneath it. */
export const ALSO_LIKED_COUNT = 12;

/**
 * Score a track against stated preferences.
 *
 * Partial credit, never filtering. Language and era are excluded on purpose:
 * as binary partitions they halved the pool at every step, and a reader who
 * likes both English and Hindi should see both. They are used for diversity
 * instead (see `selectDiverse`), so the shelf mixes without the reader having
 * to choose a side.
 */
function score(track: CuratedTrack, preferences: Preferences): number {
	let total = 0;
	if (preferences.mood && track.mood === preferences.mood) total += 3;
	if (preferences.pull && track.pull === preferences.pull) total += 2;
	// "surprise" is a real answer meaning "no preference", so it scores nothing
	// rather than being treated as unanswered.
	if (
		preferences.familiarity &&
		preferences.familiarity !== "surprise" &&
		track.familiarity === preferences.familiarity
	) {
		total += 1.5;
	}
	return total;
}

/** Deterministic shuffle, so a given day looks the same for every visitor. */
function seededOrder(length: number, seed: number): number[] {
	const indices = [...Array(length).keys()];
	let state = seed || 1;
	for (let i = length - 1; i > 0; i--) {
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

interface Ranked {
	track: CuratedTrack;
	rank: number;
}

function rankAll(preferences: Preferences, seed: number): Ranked[] {
	const order = seededOrder(CATALOGUE.length, seed);
	return order
		.map((index, position) => {
			const track = CATALOGUE[index] as CuratedTrack;
			// Position breaks ties, keeping the daily rotation visible when
			// several tracks score identically.
			return { track, rank: score(track, preferences) * 1000 - position };
		})
		.sort((a, b) => b.rank - a.rank);
}

/**
 * Pick from the ranking while keeping the shelf varied.
 *
 * Straight top-N produced three tracks in the same language from the same era,
 * often by the same artist. Each already-picked language, era and artist adds a
 * penalty, so a slightly lower-scoring track wins when it brings variety. The
 * penalties are small enough that a strong preference match still leads.
 */
function selectDiverse(ranked: Ranked[], count: number): CuratedTrack[] {
	const chosen: CuratedTrack[] = [];
	const remaining = [...ranked];

	const LANGUAGE_PENALTY = 600;
	const ERA_PENALTY = 300;
	const ARTIST_PENALTY = 4000;

	while (chosen.length < count && remaining.length > 0) {
		let bestIndex = 0;
		let bestValue = Number.NEGATIVE_INFINITY;

		for (const [index, entry] of remaining.entries()) {
			let value = entry.rank;
			for (const picked of chosen) {
				if (picked.language === entry.track.language) value -= LANGUAGE_PENALTY;
				if (picked.era === entry.track.era) value -= ERA_PENALTY;
				if (picked.artist === entry.track.artist) value -= ARTIST_PENALTY;
			}
			if (value > bestValue) {
				bestValue = value;
				bestIndex = index;
			}
		}

		const [picked] = remaining.splice(bestIndex, 1);
		if (picked) chosen.push(picked.track);
	}

	return chosen;
}

/** The day's headline picks. */
export function pickDeepDives(
	preferences: Preferences,
	seed: number,
	count = DEEP_DIVE_COUNT,
): CuratedTrack[] {
	return selectDiverse(rankAll(preferences, seed), count);
}

/**
 * "People also like" — a longer, looser shelf beneath the headline picks.
 *
 * Drawn from everything the Deep Dives did not take, still preference-weighted
 * but shuffled rather than strictly ranked, so it reads as a wander through the
 * catalogue instead of positions 4 through 15 of the same list.
 */
export function pickAlsoLiked(
	preferences: Preferences,
	seed: number,
	exclude: CuratedTrack[] = [],
	count = ALSO_LIKED_COUNT,
): CuratedTrack[] {
	const taken = new Set(exclude.map((track) => track.lrclibId));
	const pool = rankAll(preferences, seed + 1).filter(
		(entry) => !taken.has(entry.track.lrclibId),
	);

	// Weighted sample: everything stays reachable, but tracks matching the
	// reader's answers surface far more often.
	const weighted = pool.map((entry, index) => ({
		track: entry.track,
		weight: score(entry.track, preferences) + 1 + ((index * 37) % 11) / 10,
	}));

	return weighted
		.sort((a, b) => b.weight - a.weight)
		.slice(0, count)
		.map((entry) => entry.track);
}
