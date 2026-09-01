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

/**
 * Seven registers, grown from four (D-121). "Sad" was the reader's word the
 * original list could not say back: heartbroken is that answer, joyful its
 * missing opposite, nostalgic the sweeter cousin longing was covering for.
 * Order is the stepper's order — the original four keep their places so a
 * returning reader's muscle memory survives.
 */
export const MOODS = [
	"longing",
	"defiant",
	"tender",
	"restless",
	"heartbroken",
	"joyful",
	"nostalgic",
] as const;
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

/**
 * Language is a FILTER now, not a score (D-120, overturning D-027's "recorded
 * but not scored"). The testers said it plainly: "why is a Hindi song
 * recommended for me?" — a wrong-language pick is not a weaker match, it is a
 * miss. D-027's original disease — a single-select that forced a bilingual
 * reader to pick a side — is cured by multi-select, not by silence.
 *
 * The union is the OFFERED list, wider than the catalogue's current stock on
 * purpose: a language whose shelf is still empty gets an honest empty state,
 * never a silent substitution.
 */
export type Language =
	| "english"
	| "hindi"
	| "nepali"
	| "punjabi"
	| "tamil"
	| "spanish"
	| "korean";
export type Era = "classic" | "modern";

export const LANGUAGES = [
	"english",
	"hindi",
	"nepali",
	"punjabi",
	"tamil",
	"spanish",
	"korean",
] as const satisfies readonly Language[];

export interface LanguageOption {
	value: Language;
	label: string;
	/** BCP 47 primary subtags, for ordering by the browser's own locales. */
	tags: readonly string[];
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
	{ value: "english", label: "English", tags: ["en"] },
	{ value: "hindi", label: "Hindi", tags: ["hi"] },
	{ value: "nepali", label: "Nepali", tags: ["ne"] },
	{ value: "punjabi", label: "Punjabi", tags: ["pa"] },
	{ value: "tamil", label: "Tamil", tags: ["ta"] },
	{ value: "spanish", label: "Spanish", tags: ["es"] },
	{ value: "korean", label: "Korean", tags: ["ko"] },
];

/**
 * The offered answers for the three single-select axes, with the words the
 * reader sees. Lived in the stepper component until the chat replaced it
 * (D-122); they belong with the rest of the vocabulary now, because three
 * surfaces speak it — the chat's chips, the taste chips, and the
 * interpreter's echo of what it heard.
 */
export interface Option<T> {
	value: T;
	label: string;
	hint: string;
}

export const MOOD_OPTIONS: Option<Mood>[] = [
	{ value: "longing", label: "Longing", hint: "Distance, memory, ache" },
	{ value: "defiant", label: "Defiant", hint: "Anger with somewhere to go" },
	{ value: "tender", label: "Tender", hint: "Quiet, close, unguarded" },
	{ value: "restless", label: "Restless", hint: "Motion, nerve, escape" },
	{ value: "heartbroken", label: "Heartbroken", hint: "The wound, still open" },
	{ value: "joyful", label: "Joyful", hint: "Lightness that means it" },
	{ value: "nostalgic", label: "Nostalgic", hint: "Looking back, softly" },
];

export const PULL_OPTIONS: Option<Pull>[] = [
	{
		value: "storytelling",
		label: "The story",
		hint: "Songs that happen to someone",
	},
	{
		value: "wordplay",
		label: "The craft",
		hint: "Rhyme, turn, double meaning",
	},
	{
		value: "confession",
		label: "The honesty",
		hint: "Said plainly, unguarded",
	},
	{ value: "imagery", label: "The imagery", hint: "Pictures over statements" },
];

export const FAMILIARITY_OPTIONS: Option<Familiarity>[] = [
	{ value: "canon", label: "The canon", hint: "Songs worth rereading" },
	{ value: "deep", label: "Deep cuts", hint: "Things you may not know" },
	{ value: "surprise", label: "Surprise me", hint: "No preference" },
];

/**
 * The offered languages, with the reader's own first (D-120) — and only
 * languages the shelf actually STOCKS (D-127, the owner overturning
 * D-120's offer-wider-than-stock ruling): a language whose every shelf is
 * empty is a dead end wearing a button, and the honest empty state kept
 * being read as a bug. The union type stays wider so old stored choices
 * survive; the OFFER shrinks to what can be served, and grows on its own
 * the day a language is blessed into the catalogue.
 *
 * "Priority based on location" without a location: `navigator.languages` is
 * the device's ORDERED list of preferred languages — no geolocation service,
 * no permission prompt, nothing sent anywhere, which is this product's way.
 * A Kathmandu phone usually says `ne` before a geo-IP database would; stable
 * sort keeps the curated order among languages the device did not mention.
 */
export function orderLanguagesByLocale(
	locales: readonly string[],
): LanguageOption[] {
	const primaries = locales.map(
		(locale) => locale.toLowerCase().split("-")[0] ?? "",
	);
	const rank = (option: LanguageOption) => {
		const hit = primaries.findIndex((tag) => option.tags.includes(tag));
		return hit === -1 ? primaries.length : hit;
	};
	return offeredLanguageOptions().sort((a, b) => rank(a) - rank(b));
}

/** The offer, derived from stock — see the note above (D-127). */
export function offeredLanguageOptions(): LanguageOption[] {
	return LANGUAGE_OPTIONS.filter((option) =>
		CATALOGUE.some((track) => track.language === option.value),
	);
}

export interface Preferences {
	/**
	 * Single-select, like every other axis. Multi-select was tried and removed:
	 * it was the only step that could not advance on tap, so it needed a
	 * Continue button that the other two made look like friction (D-032).
	 */
	mood: Mood | null;
	pull: Pull | null;
	familiarity: Familiarity | null;
	/**
	 * MULTI-select, the deliberate exception to D-032 (D-120): people are
	 * genuinely multilingual, and a single-select here is D-027's forced
	 * side-picking again. It sits last in the stepper, where its Continue
	 * button is also the flow's natural exit. Null, empty, or absent (every
	 * pre-D-120 stored object) all mean anything.
	 */
	languages?: Language[] | null;
}

export interface CuratedTrack {
	title: string;
	artist: string;
	lrclibId: string;
	/**
	 * One line on what this song does — the editorial half of "why this"
	 * (D-045). Written, not generated: the picker is a scoring function, so a
	 * model asked to justify a pick would be inventing a rationale it had no
	 * part in. Present tense, no title-dropping, no hedging.
	 */
	note: string;
	mood: Mood;
	/**
	 * A second register the lyric genuinely carries, when it carries one
	 * (D-121). Songs are rarely one feeling — "Wish You Were Here" is longing
	 * AND nostalgic — and a single tag made the second feeling invisible to
	 * the reader who asked for it. Optional: a song that is one thing should
	 * say one thing, not be padded to two.
	 */
	moodAlso?: Mood;
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
		note: "A letter to someone who was there and not there, naming almost nothing directly.",
		mood: "longing",
		pull: "imagery",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Lag Ja Gale",
		artist: "Lata Mangeshkar",
		lrclibId: "25555080",
		note: "Asks for one embrace on the grounds that this night may not come again.",
		mood: "tender",
		moodAlso: "longing",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "In My Life",
		artist: "The Beatles",
		lrclibId: "36302255",
		note: "Weighs everyone who came before against one person, and says so plainly.",
		mood: "nostalgic",
		moodAlso: "tender",
		pull: "confession",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Tere Bina Zindagi Se",
		artist: "Kishore Kumar",
		lrclibId: "35243934",
		note: "Two people agree that life apart is fine, and neither of them believes it.",
		mood: "heartbroken",
		moodAlso: "longing",
		pull: "storytelling",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Nights",
		artist: "Frank Ocean",
		lrclibId: "31781093",
		note: "Splits in half mid-song, the way a year does when everything changes.",
		mood: "defiant",
		moodAlso: "restless",
		pull: "confession",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Choo Lo",
		artist: "The Local Train",
		lrclibId: "6631894",
		note: "Asks to be held before the feeling passes, unsure the answer will come.",
		mood: "longing",
		moodAlso: "restless",
		pull: "confession",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Motion Sickness",
		artist: "Phoebe Bridgers",
		lrclibId: "11570429",
		note: "Anger and affection for the same person, refusing to resolve into either.",
		mood: "heartbroken",
		moodAlso: "defiant",
		pull: "confession",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Agar Tum Saath Ho",
		artist: "Arijit Singh",
		lrclibId: "33945230",
		note: "Two voices arguing about whether staying is love or damage.",
		mood: "longing",
		moodAlso: "heartbroken",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Zombie",
		artist: "The Cranberries",
		lrclibId: "35051290",
		note: "Names a specific killing and refuses to let it become a metaphor.",
		mood: "defiant",
		moodAlso: "heartbroken",
		pull: "storytelling",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Fight the Power",
		artist: "Public Enemy",
		lrclibId: "37063910",
		note: "Stacks references until the argument becomes a sound you cannot ignore.",
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
		note: "A confession, a trial and a shrug, in six minutes and three keys.",
		mood: "defiant",
		moodAlso: "heartbroken",
		pull: "storytelling",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Alright",
		artist: "Kendrick Lamar",
		lrclibId: "9500955",
		note: "Holds a promise steady over evidence that it should not hold.",
		mood: "defiant",
		moodAlso: "heartbroken",
		pull: "wordplay",
		familiarity: "canon",
		language: "english",
		era: "modern",
	},
	{
		title: "Seven Nation Army",
		artist: "The White Stripes",
		lrclibId: "32223262",
		note: "One riff, and a man leaving town before he can be talked out of it.",
		mood: "defiant",
		moodAlso: "restless",
		pull: "storytelling",
		familiarity: "canon",
		language: "english",
		era: "modern",
	},
	{
		title: "Yeh Jo Des Hai Tera",
		artist: "A.R. Rahman",
		lrclibId: "34798363",
		note: "Homesickness written as a country calling a person back.",
		mood: "longing",
		moodAlso: "tender",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Something",
		artist: "The Beatles",
		lrclibId: "36255521",
		note: "Cannot say why, and makes the not-knowing the whole point.",
		mood: "tender",
		pull: "confession",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Wonderful Tonight",
		artist: "Eric Clapton",
		lrclibId: "29098309",
		note: "An ordinary evening described so closely it becomes the reason.",
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
		note: "A thought arriving unbidden that someone was made for you.",
		mood: "longing",
		moodAlso: "tender",
		pull: "imagery",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Chura Liya Hai Tumne",
		artist: "Asha Bhosle",
		lrclibId: "15931477",
		note: "Playful theft as a love song, all lightness over real stakes.",
		mood: "tender",
		moodAlso: "longing",
		pull: "storytelling",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Holocene",
		artist: "Bon Iver",
		lrclibId: "23555615",
		note: "Smallness offered as consolation rather than defeat.",
		mood: "nostalgic",
		moodAlso: "tender",
		pull: "imagery",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "First Day of My Life",
		artist: "Bright Eyes",
		lrclibId: "17585749",
		note: "Starts at the moment doubt ended, and stays there.",
		mood: "joyful",
		moodAlso: "tender",
		pull: "confession",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Tum Se Hi",
		artist: "Mohit Chauhan",
		lrclibId: "34291699",
		note: "Everything ordinary rerouted through one person.",
		mood: "tender",
		moodAlso: "longing",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Raabta",
		artist: "Arijit Singh",
		lrclibId: "35784288",
		note: "A pull older than the meeting, treated as fact rather than question.",
		mood: "tender",
		moodAlso: "joyful",
		pull: "imagery",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Karma Police",
		artist: "Radiohead",
		lrclibId: "31503287",
		note: "Petty grievance escalated into cosmic complaint, then abandoned.",
		mood: "defiant",
		moodAlso: "restless",
		pull: "imagery",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Smells Like Teen Spirit",
		artist: "Nirvana",
		lrclibId: "31750367",
		note: "Boredom and fury with nowhere to put either.",
		mood: "defiant",
		moodAlso: "restless",
		pull: "wordplay",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Once in a Lifetime",
		artist: "Talking Heads",
		lrclibId: "9228305",
		note: "A life examined mid-sentence by someone who did not choose it.",
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
		note: "Four songs bolted together by the same disgust.",
		mood: "defiant",
		moodAlso: "restless",
		pull: "imagery",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Blinding Lights",
		artist: "The Weeknd",
		lrclibId: "36523298",
		note: "Driving at night to feel something, and calling it love.",
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
		note: "Suspicion set to a groove slow enough to sit inside.",
		mood: "heartbroken",
		moodAlso: "longing",
		pull: "imagery",
		familiarity: "canon",
		language: "english",
		era: "modern",
	},
	{
		title: "Nadaan Parindey",
		artist: "Mohit Chauhan",
		lrclibId: "34060184",
		note: "A bird told to go home, by someone who cannot.",
		mood: "longing",
		moodAlso: "tender",
		pull: "storytelling",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Ilahi",
		artist: "Arijit Singh",
		lrclibId: "35458952",
		note: "Leaving as a prayer rather than an escape.",
		mood: "restless",
		moodAlso: "joyful",
		pull: "storytelling",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Dil Se Re",
		artist: "A.R. Rahman",
		lrclibId: "33769880",
		note: "Devotion pitched at the volume of a riot.",
		mood: "longing",
		pull: "imagery",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Teardrop",
		artist: "Massive Attack",
		lrclibId: "27327276",
		note: "A heartbeat under a voice that never raises itself.",
		mood: "tender",
		pull: "imagery",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Creep",
		artist: "Radiohead",
		lrclibId: "27196790",
		note: "Self-loathing said out loud, with no attempt to make it charming.",
		mood: "heartbroken",
		moodAlso: "longing",
		pull: "confession",
		familiarity: "canon",
		language: "english",
		era: "classic",
	},
	{
		title: "Kun Faya Kun",
		artist: "A.R. Rahman",
		lrclibId: "35218012",
		note: "Surrender described as the moment something begins.",
		mood: "longing",
		moodAlso: "tender",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Ae Dil Hai Mushkil",
		artist: "Arijit Singh",
		lrclibId: "879427",
		note: "Loving without return, argued as a position rather than a wound.",
		mood: "longing",
		moodAlso: "defiant",
		pull: "wordplay",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Masakali",
		artist: "Mohit Chauhan",
		lrclibId: "34637618",
		note: "A pigeon told to fly, meaning a girl told to.",
		mood: "joyful",
		moodAlso: "defiant",
		pull: "wordplay",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Roobaroo",
		artist: "Naresh Iyer",
		lrclibId: "7912114",
		note: "Waking up treated as a political act.",
		mood: "defiant",
		moodAlso: "joyful",
		pull: "imagery",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Khwaja Mere Khwaja",
		artist: "A.R. Rahman",
		lrclibId: "37323926",
		note: "Devotion that circles rather than arrives.",
		mood: "longing",
		moodAlso: "tender",
		pull: "imagery",
		familiarity: "canon",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Yeh Duniya Agar Mil Bhi Jaye",
		artist: "Mohammed Rafi",
		lrclibId: "31558586",
		note: "Refuses a world it has already seen the workings of.",
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
		note: "Asks the proud where exactly they are looking.",
		mood: "defiant",
		moodAlso: "heartbroken",
		pull: "imagery",
		familiarity: "deep",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Mera Joota Hai Japani",
		artist: "Mukesh",
		lrclibId: "37057544",
		note: "Borrowed clothes, borrowed everything, and a heart that is not.",
		mood: "joyful",
		moodAlso: "defiant",
		pull: "wordplay",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Musafir Hoon Yaaron",
		artist: "Kishore Kumar",
		lrclibId: "18472648",
		note: "No house, no address, and no complaint about either.",
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
		note: "Notices that nobody comes back, and keeps walking.",
		mood: "defiant",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Aane Wala Pal",
		artist: "Kishore Kumar",
		lrclibId: "37924734",
		note: "The moment is already gone. That is the whole song.",
		mood: "nostalgic",
		pull: "confession",
		familiarity: "canon",
		language: "hindi",
		era: "classic",
	},
	{
		title: "Main Pal Do Pal Ka Shayar",
		artist: "Mukesh",
		lrclibId: "22267656",
		note: "A poet measuring his own shelf life, out loud.",
		mood: "tender",
		moodAlso: "longing",
		pull: "confession",
		familiarity: "deep",
		language: "hindi",
		era: "classic",
	},
	{
		title: "The Night We Met",
		artist: "Lord Huron",
		lrclibId: "34481607",
		note: "Wants the meeting undone, not the love.",
		mood: "longing",
		moodAlso: "heartbroken",
		pull: "confession",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Re: Stacks",
		artist: "Bon Iver",
		lrclibId: "22660720",
		note: "Grief sorted slowly, the way you clear a room.",
		mood: "heartbroken",
		moodAlso: "tender",
		pull: "imagery",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Casimir Pulaski Day",
		artist: "Sufjan Stevens",
		lrclibId: "16990543",
		note: "A death told in small specific facts, faith included.",
		mood: "heartbroken",
		moodAlso: "tender",
		pull: "storytelling",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "A Case of You",
		artist: "Joni Mitchell",
		lrclibId: "12937387",
		note: "Love as something you could drink and still stand.",
		mood: "longing",
		moodAlso: "defiant",
		pull: "imagery",
		familiarity: "deep",
		language: "english",
		era: "classic",
	},
	{
		title: "Pyramid Song",
		artist: "Radiohead",
		lrclibId: "25112927",
		note: "Time collapsed, and everyone who ever was, at once.",
		mood: "tender",
		pull: "imagery",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "The Trapeze Swinger",
		artist: "Iron and Wine",
		lrclibId: "30010199",
		note: "A list of things to remember, addressed to someone gone.",
		mood: "longing",
		moodAlso: "nostalgic",
		pull: "storytelling",
		familiarity: "deep",
		language: "english",
		era: "modern",
	},
	{
		title: "Phir Le Aya Dil",
		artist: "Arijit Singh",
		lrclibId: "6827664",
		note: "The heart keeps returning somewhere the person has left.",
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
		note: "One string, one thought, repeated until it means something.",
		mood: "longing",
		moodAlso: "restless",
		pull: "imagery",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Naina Da Kya Kasoor",
		artist: "Amit Trivedi",
		lrclibId: "5452480",
		note: "Blames the eyes to avoid blaming the self.",
		mood: "heartbroken",
		moodAlso: "restless",
		pull: "wordplay",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Aaoge Jab Tum",
		artist: "Ustad Rashid Khan",
		lrclibId: "21638733",
		note: "A house that only becomes one when someone arrives.",
		mood: "longing",
		moodAlso: "tender",
		pull: "confession",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},
	{
		title: "Zinda",
		artist: "Siddharth Mahadevan",
		lrclibId: "9211620",
		note: "Being alive stated as a decision, repeatedly.",
		mood: "defiant",
		pull: "confession",
		familiarity: "deep",
		language: "hindi",
		era: "modern",
	},

	/* ---------------------------------------------------------------
	   The first Nepali shelf (D-120) — proposed by the expansion
	   pipeline, every entry verified on LRCLIB with synced lyrics, and
	   blessed by the owner on 2026-08-28. Artist names normalised from
	   LRCLIB's tagging where it was noisy ("Amrit Gurung-nepathya").
	   --------------------------------------------------------------- */
	{
		title: "Salaijyo",
		artist: "Nepathya",
		lrclibId: "11539833",
		note: "Carries a hillside courtship on a folk refrain that never hurries.",
		mood: "longing",
		moodAlso: "heartbroken",
		pull: "imagery",
		familiarity: "canon",
		language: "nepali",
		era: "classic",
	},
	{
		title: "Resham",
		artist: "Nepathya",
		lrclibId: "4832933",
		note: "Lets silk stand for everything soft a wanderer misses.",
		mood: "defiant",
		moodAlso: "heartbroken",
		pull: "imagery",
		familiarity: "canon",
		language: "nepali",
		era: "classic",
	},
	{
		title: "Bhedako Oon Jasto",
		artist: "Nepathya",
		lrclibId: "36858348",
		note: "Promises a love plain as wool — warm, unglamorous, held up as enough.",
		mood: "joyful",
		pull: "imagery",
		familiarity: "canon",
		language: "nepali",
		era: "classic",
	},
	{
		title: "Aama",
		artist: "Sushant KC",
		lrclibId: "34696323",
		note: "Says to a mother the plain things sons rehearse and rarely deliver.",
		mood: "tender",
		moodAlso: "nostalgic",
		pull: "confession",
		familiarity: "canon",
		language: "nepali",
		era: "modern",
	},
	{
		title: "Saunko Jhari Bani",
		artist: "Narayan Gopal",
		lrclibId: "7228540",
		note: "Asks the monsoon itself to stand in for a voice that cannot reach.",
		mood: "longing",
		moodAlso: "heartbroken",
		pull: "imagery",
		familiarity: "canon",
		language: "nepali",
		era: "classic",
	},
	{
		title: "Jati Maya",
		artist: "1974 AD",
		lrclibId: "12985990",
		note: "Counts what loving cost and admits it would pay again.",
		mood: "heartbroken",
		pull: "confession",
		familiarity: "canon",
		language: "nepali",
		era: "classic",
	},
	{
		title: "Jhuto Maya",
		artist: "The Edge Band",
		lrclibId: "10106046",
		note: "Names a love false to its face and refuses to grieve it politely.",
		mood: "heartbroken",
		moodAlso: "defiant",
		pull: "confession",
		familiarity: "deep",
		language: "nepali",
		era: "modern",
	},
	{
		title: "Mero Maya",
		artist: "Bipul Chettri",
		lrclibId: "9588737",
		note: "Sends love across ridgelines in a voice that knows the distance.",
		mood: "longing",
		pull: "imagery",
		familiarity: "deep",
		language: "nepali",
		era: "modern",
	},
	{
		title: "Ki Banu Duniya Da",
		artist: "Gurdas Maan",
		lrclibId: "23686113",
		note: "Asks what will become of the world, and lists the reasons it has to ask.",
		mood: "heartbroken",
		pull: "confession",
		familiarity: "canon",
		language: "punjabi",
		era: "classic",
	},
	{
		title: "295",
		artist: "Sidhu Moose Wala",
		lrclibId: "35500055",
		note: "Prices truth-telling at a penal code section, and pays it anyway.",
		mood: "defiant",
		pull: "storytelling",
		familiarity: "canon",
		language: "punjabi",
		era: "modern",
	},
	{
		title: "So High",
		artist: "Sidhu Moose Wala",
		lrclibId: "6710849",
		note: "Lets one word for high carry both the swagger and the hollow under it.",
		mood: "defiant",
		pull: "wordplay",
		familiarity: "canon",
		language: "punjabi",
		era: "modern",
	},
	{
		title: "Ikk Kudi (Reprised)",
		artist: "Diljit Dosanjh",
		lrclibId: "34620556",
		note: "Searches for a girl whose name is love, and reports her missing.",
		mood: "longing",
		moodAlso: "tender",
		pull: "imagery",
		familiarity: "canon",
		language: "punjabi",
		era: "modern",
	},
	{
		title: "Baapu",
		artist: "Sidhu Moose Wala",
		lrclibId: "33175927",
		note: "Offers a life back to the man who paid for it, in words saved for a father.",
		mood: "tender",
		moodAlso: "nostalgic",
		pull: "confession",
		familiarity: "deep",
		language: "punjabi",
		era: "modern",
	},
	{
		title: "Saaun Di Jhadi",
		artist: "Babbu Maan",
		lrclibId: "23269978",
		note: "Lets the monsoon set the tempo and dances wherever it lands.",
		mood: "joyful",
		pull: "imagery",
		familiarity: "deep",
		language: "punjabi",
		era: "classic",
	},
	{
		title: "Titliaan",
		artist: "Afsana Khan",
		lrclibId: "36660242",
		note: "Loves someone who chases butterflies, and counts what wanders off with them.",
		mood: "heartbroken",
		moodAlso: "longing",
		pull: "imagery",
		familiarity: "canon",
		language: "punjabi",
		era: "modern",
	},
	{
		title: "Bambiha Bole",
		artist: "Amrit Maan, Sidhu Moose Wala",
		lrclibId: "24230914",
		note: "Borrows a folk bird's call and loads it like a warning shot.",
		mood: "defiant",
		pull: "wordplay",
		familiarity: "canon",
		language: "punjabi",
		era: "modern",
	},
	{
		title: "봄날 (Spring Day)",
		artist: "BTS",
		lrclibId: "32577116",
		note: "Waits out a winter of missing someone, in a language where seeing and missing share a verb.",
		mood: "longing",
		pull: "wordplay",
		familiarity: "canon",
		language: "korean",
		era: "modern",
	},
	{
		title: "LION",
		artist: "(G)I-DLE",
		lrclibId: "34718723",
		note: "Refuses the tamer's terms and crowns itself mid-roar.",
		mood: "defiant",
		pull: "imagery",
		familiarity: "canon",
		language: "korean",
		era: "modern",
	},
	{
		title: "Whalien 52",
		artist: "BTS",
		lrclibId: "17263802",
		note: "Sings at a frequency no one else can hear, and keeps singing.",
		mood: "longing",
		moodAlso: "defiant",
		pull: "imagery",
		familiarity: "deep",
		language: "korean",
		era: "modern",
	},
	{
		title: "첫눈처럼 너에게 가겠다 (Like the First Snow)",
		artist: "Ailee",
		lrclibId: "30512376",
		note: "Promises a return timed to the first snow, so every winter opens a door.",
		mood: "longing",
		moodAlso: "tender",
		pull: "imagery",
		familiarity: "canon",
		language: "korean",
		era: "modern",
	},
	{
		title: "The 7th Sense",
		artist: "NCT U",
		lrclibId: "16679653",
		note: "Circles a sleep that will not settle, and names the unease a new sense.",
		mood: "restless",
		moodAlso: "defiant",
		pull: "imagery",
		familiarity: "deep",
		language: "korean",
		era: "modern",
	},
	{
		title: "Celebrity",
		artist: "IU",
		lrclibId: "25777983",
		note: "Tells an odd, bruised listener that their strangeness is the star turn.",
		mood: "tender",
		moodAlso: "joyful",
		pull: "imagery",
		familiarity: "canon",
		language: "korean",
		era: "modern",
	},
	{
		title: "눈, 코, 입 (Eyes, Nose, Lips)",
		artist: "Taeyang",
		lrclibId: "33125939",
		note: "Inventories a face feature by feature, because that is all that stayed.",
		mood: "heartbroken",
		moodAlso: "longing",
		pull: "imagery",
		familiarity: "canon",
		language: "korean",
		era: "modern",
	},
	{
		title: "Epiphany",
		artist: "Jin",
		lrclibId: "12173929",
		note: "Turns a vow made to someone else around until it lands on the self.",
		mood: "defiant",
		moodAlso: "tender",
		pull: "confession",
		familiarity: "deep",
		language: "korean",
		era: "modern",
	},
	{
		title: "기억을 걷는 시간 (Time Walking on Memory)",
		artist: "Nell",
		lrclibId: "30241664",
		note: "Walks memory like a street where one door keeps opening on its own.",
		mood: "longing",
		moodAlso: "heartbroken",
		pull: "imagery",
		familiarity: "deep",
		language: "korean",
		era: "modern",
	},
	{
		title: "DALLA DALLA",
		artist: "ITZY",
		lrclibId: "8276434",
		note: "Answers every measuring stick with the same word: different.",
		mood: "defiant",
		pull: "wordplay",
		familiarity: "canon",
		language: "korean",
		era: "modern",
	},
];

/** The headline shelf (PRD §3.1 suggests three). */
export const DEEP_DIVE_COUNT = 3;
/** The longer "People also like" shelf beneath it. */
export const ALSO_LIKED_COUNT = 12;

/**
 * Does this track carry the asked-for mood at all — primarily or secondarily?
 * The one predicate the promise (D-121) is built on: scoring, filtering and
 * explaining must all agree on what "matches the mood" means, so they all
 * call this.
 */
export function matchesMood(track: CuratedTrack, mood: Mood): boolean {
	return track.mood === mood || track.moodAlso === mood;
}

/**
 * Score a track against stated preferences.
 *
 * Partial credit, never filtering. Language and era are excluded on purpose:
 * as binary partitions they halved the pool at every step, and a reader who
 * likes both English and Hindi should see both. They are used for diversity
 * instead (see `selectDiverse`), so the shelf mixes without the reader having
 * to choose a side.
 *
 * Mood outweighs everything else combined (4 > 2 + 1.5), by ruling (D-121):
 * at weight 3 a track matching pull AND familiarity outranked one matching
 * only the mood, so the reader who asked for sad songs got clever un-sad ones
 * — the emotional axis, the one answered with the most feeling, was the one
 * that lost the tiebreak. A secondary mood is a true but weaker match: it
 * keeps the promise, and yields to any track that leads with the feeling.
 */
function score(track: CuratedTrack, preferences: Preferences): number {
	let total = 0;
	if (preferences.mood && track.mood === preferences.mood) total += 4;
	else if (preferences.mood && matchesMood(track, preferences.mood))
		total += 2.5;
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

/**
 * A stable, compact identity for a set of answers (D-047).
 *
 * Becomes part of the insight cache key, so it must be deterministic and it
 * must never contain anything the reader typed — hence fixed enum values in a
 * fixed order rather than serialising the object.
 */
export function preferenceSignature(preferences: Preferences): string {
	const { mood, pull, familiarity } = preferences;
	const languages = preferences.languages ?? [];
	if (!mood && !pull && !familiarity && languages.length === 0) return "none";
	const base = [mood ?? "-", pull ?? "-", familiarity ?? "-"].join(".");
	// Sorted, so {english, nepali} and {nepali, english} are one identity —
	// and absent entirely when unset, so every pre-D-120 signature (and its
	// cached work) survives unchanged.
	return languages.length > 0
		? `${base}.${[...languages].sort().join("+")}`
		: base;
}

/**
 * Coerce an untrusted object into `Preferences`, dropping anything not in the
 * enums. Same reasoning as `parsePreferences`, for callers that already hold
 * an object rather than a query string.
 */
export function normalisePreferences(value: unknown): Preferences {
	const raw = (value ?? {}) as Record<string, unknown>;
	const pick = <T extends string>(
		name: string,
		allowed: readonly T[],
	): T | null => {
		const candidate = raw[name];
		return typeof candidate === "string" &&
			(allowed as readonly string[]).includes(candidate)
			? (candidate as T)
			: null;
	};

	// Deduped and enum-checked one by one; junk entries drop rather than
	// poison the array. Empty after cleaning means "anything" — null.
	const rawLanguages = raw.languages;
	const languages = Array.isArray(rawLanguages)
		? [
				...new Set(
					rawLanguages.filter(
						(entry): entry is Language =>
							typeof entry === "string" &&
							(LANGUAGES as readonly string[]).includes(entry),
					),
				),
			]
		: [];

	return {
		mood: pick("mood", MOODS),
		pull: pick("pull", PULLS),
		familiarity: pick("familiarity", FAMILIARITIES),
		languages: languages.length > 0 ? languages : null,
	};
}

/**
 * Read answers off a query string, rejecting anything not in the enums.
 *
 * These arrive from the client and end up in a cache key, so an unvalidated
 * value would let a caller mint unlimited cache entries — and each miss is a
 * Gemini call against a 20-a-day quota (OD-021).
 */
export function parsePreferences(params: URLSearchParams): Preferences {
	const pick = <T extends string>(
		name: string,
		allowed: readonly T[],
	): T | null => {
		const value = params.get(name);
		return value && (allowed as readonly string[]).includes(value)
			? (value as T)
			: null;
	};

	// `languages=english+nepali` — enum-checked entry by entry, deduped,
	// empty-after-cleaning collapses to null exactly as normalise does.
	const languages = [
		...new Set(
			(params.get("languages") ?? "")
				.split(/[+,\s]+/)
				.filter((entry): entry is Language =>
					(LANGUAGES as readonly string[]).includes(entry),
				),
		),
	];

	return {
		mood: pick("mood", MOODS),
		pull: pick("pull", PULLS),
		familiarity: pick("familiarity", FAMILIARITIES),
		languages: languages.length > 0 ? languages : null,
	};
}

/**
 * Why this track was picked, in the reader's terms (D-045).
 *
 * Derived from `score` rather than described alongside it: `matched` lists the
 * axes that actually earned points, so the stated reason is the real one. An
 * explanation written independently of the scoring would drift from it the
 * first time a weight changed, and a generated one would be inventing a
 * rationale for a decision it had no part in.
 *
 * `matched` is empty when the reader skipped the stepper. That is not a
 * failure — it means the pick came from the day's rotation, and the caller
 * should say so rather than claim a reason.
 */
export interface Explanation {
	/** Reader-facing labels for the axes that scored, strongest first. */
	matched: string[];
	/** The editorial line for this track. */
	note: string;
}

/**
 * The mood as a possessive noun, for the landing's answered-state title
 * (D-105): "Songs for your longing / defiance / tenderness / restlessness".
 * Separate from MOOD_LABEL below, whose phrasing ("something defiant") is
 * built for the match sentence and reads wrong after "your".
 */
export const MOOD_TITLE_NOUN: Record<Mood, string> = {
	longing: "longing",
	defiant: "defiance",
	tender: "tenderness",
	restless: "restlessness",
	heartbroken: "heartbreak",
	joyful: "joy",
	nostalgic: "nostalgia",
};

const MOOD_LABEL: Record<Mood, string> = {
	longing: "longing",
	defiant: "something defiant",
	tender: "something tender",
	restless: "restlessness",
	heartbroken: "heartbreak",
	joyful: "something joyful",
	nostalgic: "nostalgia",
};

const PULL_LABEL: Record<Pull, string> = {
	storytelling: "the story",
	wordplay: "the craft",
	confession: "the honesty",
	imagery: "the imagery",
};

const FAMILIARITY_LABEL: Record<Exclude<Familiarity, "surprise">, string> = {
	canon: "the canon",
	deep: "deep cuts",
};

export function explainPick(
	track: CuratedTrack,
	preferences: Preferences,
): Explanation {
	const matched: string[] = [];

	// Same conditions as `score`, in the same weight order, so the sentence
	// cannot claim a reason the scoring did not use. A secondary-mood match
	// earns the same label: the reader asked for heartbreak and the song
	// carries it — WHICH tag it carries it on is bookkeeping, not a reason.
	if (preferences.mood && matchesMood(track, preferences.mood)) {
		matched.push(MOOD_LABEL[preferences.mood]);
	}
	if (preferences.pull && track.pull === preferences.pull) {
		matched.push(PULL_LABEL[preferences.pull]);
	}
	if (
		preferences.familiarity &&
		preferences.familiarity !== "surprise" &&
		track.familiarity === preferences.familiarity
	) {
		matched.push(FAMILIARITY_LABEL[preferences.familiarity]);
	}

	return { matched, note: track.note };
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
	/** Index in the rotation's shuffle, so the shortlist can be reordered by it. */
	position: number;
}

/**
 * Far larger than any score can reach, so anything already read sinks beneath
 * everything unread — but finite, so a reader who has been through the whole
 * catalogue still gets a shelf rather than an empty page (D-072).
 */
const SEEN_PENALTY = 100_000;

/**
 * What the reader has told the shelves directly (D-121) — stored locally,
 * like preferences; nothing leaves the browser.
 *
 * `hidden` is a contract, not a hint: "Not for me" removes the track from
 * every recommendation shelf permanently (search still reaches it — the
 * reader refused the recommendation, not the song's existence). A rejected
 * song that resurfaces reads as not listening, which is the disease this
 * whole decision treats.
 *
 * `liked` is "more like this": each liked track lends its attributes a
 * small pull on everything similar.
 */
export interface Taste {
	hidden?: readonly string[];
	liked?: readonly string[];
}

/**
 * How much everything the reader has liked pulls on this track.
 *
 * Shared artist counts most — "more like this" most often means "more of
 * them" — then the mood the liked song carries, then its pull and language.
 * CAPPED below the mood weight (3 < 4) on purpose: accumulated taste nudges,
 * but a question the reader answered TODAY outranks every like they have
 * ever made. Without the cap, a dozen likes would quietly overrule the
 * stepper, and the reader would have no idea why their answers stopped
 * working.
 */
function affinity(track: CuratedTrack, liked: readonly CuratedTrack[]): number {
	let total = 0;
	for (const other of liked) {
		if (other.lrclibId === track.lrclibId) continue;
		if (other.artist === track.artist) total += 1.5;
		if (
			matchesMood(track, other.mood) ||
			(other.moodAlso && matchesMood(track, other.moodAlso))
		) {
			total += 1;
		}
		if (other.pull === track.pull) total += 0.5;
		if (other.language === track.language) total += 0.5;
	}
	return Math.min(total, 3);
}

/** Resolve liked ids to catalogue entries; unknown ids simply carry nothing. */
function likedTracks(taste: Taste | undefined): CuratedTrack[] {
	const ids = taste?.liked;
	if (!ids || ids.length === 0) return [];
	const wanted = new Set(ids);
	return CATALOGUE.filter((track) => wanted.has(track.lrclibId));
}

/**
 * The catalogue the reader's languages admit (D-120). A hard filter BEFORE
 * ranking, not a score: a wrong-language pick is a miss, not a weaker match —
 * and `selectDiverse` actively rewards language variety, so a mere score
 * bump would be fought by the diversity pass and lose.
 */
function languagePool(preferences: Preferences, taste?: Taste): CuratedTrack[] {
	const languages = preferences.languages;
	// "Not for me" is honoured before anything is ranked (D-121): a hidden
	// track is not a weak candidate, it is not a candidate.
	const hidden = new Set(taste?.hidden ?? []);
	const pool =
		hidden.size > 0
			? CATALOGUE.filter((track) => !hidden.has(track.lrclibId))
			: CATALOGUE;
	if (!languages || languages.length === 0) return pool;
	return pool.filter((track) => languages.includes(track.language));
}

function rankAll(
	preferences: Preferences,
	seed: number,
	seen: ReadonlySet<string> = new Set(),
	taste?: Taste,
): Ranked[] {
	const pool = languagePool(preferences, taste);
	const liked = likedTracks(taste);
	const order = seededOrder(pool.length, seed);
	return order
		.map((index, position) => {
			const track = pool[index] as CuratedTrack;
			// Position breaks ties, keeping the rotation visible when several
			// tracks score identically.
			let rank =
				(score(track, preferences) + affinity(track, liked)) * 1000 - position;
			// Recommending a song the reader has already opened is the one
			// suggestion that cannot possibly help them explore.
			if (seen.has(track.lrclibId)) rank -= SEEN_PENALTY;
			return { track, rank, position };
		})
		.sort((a, b) => b.rank - a.rank);
}

/**
 * How many tracks the rotation gets to choose between (D-072).
 *
 * Relevance picks the shortlist; the rotation picks from it. Twelve, so a
 * shelf of three has four times as many candidates as slots.
 *
 * Weighting the shuffle against the score does not work here, and the
 * arithmetic says why: `score` moves in steps of 1.5 to 4, which the ×1000
 * scale turns into gaps of 1500–4000, while the shuffled position spans 0–55.
 * Any multiplier small enough to preserve relevance is far too small to move
 * anything, and any multiplier large enough to move something has thrown
 * relevance away. A reader who answered all three questions saw FOUR distinct
 * tracks across ten visits, because only four in the catalogue reach the top
 * tier and nothing could displace them.
 *
 * A shortlist separates the two decisions instead of trying to balance them in
 * one number: everything in the window is a genuinely good match, and which
 * three of them appear is the rotation's business.
 */
const SHORTLIST = DEEP_DIVE_COUNT * 4;

/**
 * Every track that matches the answers as well as the best one does, and no
 * track that matches them less well — unless there are not enough to fill a
 * shelf.
 *
 * Cutting the shortlist at a fixed twelve was the first attempt and it broke a
 * promise the product makes: answer "defiant" and every pick is defiant. There
 * are fewer than twelve defiant tracks in the catalogue, so a fixed window
 * reached past them into songs the reader had just said they did not want.
 *
 * Cutting at the score CLIFF instead keeps that promise exactly, and still
 * gives the rotation room wherever the tier is wide — which is most of the
 * time, because one answer matches many tracks. A reader who answers all three
 * questions gets a narrow tier and a small shelf, and that is honest: in a
 * catalogue of fifty-six there are only so many songs that are longing, and
 * confessional, and deep cuts. Exploration for that reader lives in "People
 * also like", which is loose by design.
 */
function topTier(
	ranked: Ranked[],
	preferences: Preferences,
	count: number,
	/** Liked tracks, so the cliff is cut on the same number `rankAll` used. */
	liked: readonly CuratedTrack[] = [],
): Ranked[] {
	const scores = ranked.map(
		(entry) => score(entry.track, preferences) + affinity(entry.track, liked),
	);
	const best = Math.max(...scores, 0);

	const tier = ranked.filter((_, index) => scores[index] === best);
	if (tier.length >= count) return tier.slice(0, SHORTLIST);

	// Not enough at the top to fill the shelf: take the next-best as well,
	// rather than showing two cards and a gap.
	return ranked.slice(0, Math.max(count, tier.length)).slice(0, SHORTLIST);
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
	/** LRCLIB ids the reader has already opened, pushed to the back. */
	seen: readonly string[] = [],
	/** What the reader has hidden and liked (D-121). */
	taste?: Taste,
): CuratedTrack[] {
	let ranked = rankAll(preferences, seed, new Set(seen), taste);

	// The mood is a PROMISE on this shelf (D-121), the way language already is
	// (D-120): answer "heartbroken" and every headline pick carries heartbreak,
	// or the shelf runs short and says so — never padded with songs the reader
	// just said they did not want. `topTier`'s reach-down fallback now reaches
	// only within the mood. Exploration still lives in "People also like",
	// which stays loose by design.
	const mood = preferences.mood;
	if (mood) ranked = ranked.filter((entry) => matchesMood(entry.track, mood));

	// Relevance decides WHICH tracks are eligible; the rotation decides which
	// of them appear. Re-ranking the shortlist by shuffled position alone is
	// what makes a second visit worth making.
	const shortlist = topTier(ranked, preferences, count, likedTracks(taste)).map(
		(entry) => ({
			...entry,
			rank: -entry.position,
		}),
	);

	return selectDiverse(shortlist, count);
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
	/** LRCLIB ids the reader has already opened, pushed to the back. */
	seen: readonly string[] = [],
	/** What the reader has hidden and liked (D-121). */
	taste?: Taste,
): CuratedTrack[] {
	const taken = new Set(exclude.map((track) => track.lrclibId));
	const pool = rankAll(preferences, seed + 1, new Set(seen), taste).filter(
		(entry) => !taken.has(entry.track.lrclibId),
	);
	const liked = likedTracks(taste);

	// Weighted sample: everything stays reachable, but tracks matching the
	// reader's answers surface far more often.
	const seenIds = new Set(seen);
	const weighted = pool.map((entry, index) => ({
		track: entry.track,
		weight:
			score(entry.track, preferences) +
			affinity(entry.track, liked) +
			1 +
			((index * 37) % 11) / 10 -
			// `rankAll` already sank these, but the weighting below recomputes
			// from `score` and would otherwise hand them back their places.
			(seenIds.has(entry.track.lrclibId) ? 100 : 0),
	}));

	return weighted
		.sort((a, b) => b.weight - a.weight)
		.slice(0, count)
		.map((entry) => entry.track);
}
