import type { TrackSummary } from "./types";

/**
 * Choosing which RECORDING a search result refers to (OD-028).
 *
 * LRCLIB is user-contributed and holds many uploads per song — but they are
 * not all uploads of the same performance. Searching "lag ja gale" returns
 * five covers before it returns Lata Mangeshkar, and "holocene" returns a
 * different song of the same name first. Ranking previously read only whether
 * an entry was well-formed and whether it had synced lyrics; in practice every
 * candidate is synced, so that tie-break never fired and LRCLIB's own ordering
 * decided.
 *
 * This matters more here than it would in a search box, because an LRC file's
 * timings belong to the recording it was made from. A LoFi cover's timings are
 * CORRECT for the LoFi cover. Pick the wrong entry and the reader gets lyrics
 * that scroll against a different tempo, a different arrangement, sometimes
 * different words — and every part of it "works", which is why the fault is so
 * hard to see from inside the app.
 */

/* -------------------------------------------------------------------------
   Variant tags — a different recording, not a different label

   Deliberately separate from the "packaging" vocabulary in genius.server.ts,
   and the distinction is the whole point:

     packaging   "Official Video", "Audio", "HD"  — the same recording, labelled
     variant     "LoFi", "Live", "Demo", "Remix"  — a different performance

   Packaging is stripped before searching Genius (D-070) and costs the entry
   nothing here. A variant is a real difference and is ranked below the
   original, but never removed: someone may have come for the Sanam cover, and
   refusing to show it would be its own kind of wrong.
   ---------------------------------------------------------------------- */
const VARIANT_WORDS = new Set([
	"lofi",
	"lo",
	"fi",
	"slowed",
	"reverb",
	"remix",
	"mix",
	"demo",
	"live",
	"cover",
	"karaoke",
	"instrumental",
	"acoustic",
	"unplugged",
	"8d",
	"sped",
	"nightcore",
	"mashup",
	"reprise",
	"rework",
	"reloaded",
	"revisited",
	"bootleg",
	"session",
	"sessions",
	"rehearsal",
	"jam",
	"tribute",
]);

/** Bracketed groups, and the tail after a top-level " - ". */
function qualifiers(title: string): string[] {
	const found: string[] = [];
	for (const match of title.matchAll(/[([{]([^)\]}]*)[)\]}]/g)) {
		if (match[1]) found.push(match[1]);
	}

	// A dash tail, but only outside brackets — "Come and Get Your Love (Single
	// Edit - Audio)" must not be read as a top-level qualifier.
	let depth = 0;
	for (let i = 0; i < title.length; i++) {
		const char = title[i] as string;
		if (char === "(" || char === "[" || char === "{") depth++;
		else if (char === ")" || char === "]" || char === "}")
			depth = Math.max(0, depth - 1);
		else if (depth === 0 && title.startsWith(" - ", i)) {
			found.push(title.slice(i + 3));
			break;
		}
	}
	return found;
}

const words = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.split(" ")
		.filter(Boolean);

/**
 * True when the title marks itself as a different recording.
 *
 * Only qualifier positions are examined — inside brackets, or after a
 * top-level dash. A bare word search would demote "Live and Let Die" and
 * "Cover Me", which are songs, not versions of songs.
 */
export function isVariant(title: string): boolean {
	// A hyphen-joined tag needs no separator to be a qualifier: "Tum Se Hi-LoFi".
	const trailing = title.match(/-\s*([A-Za-z0-9 ]+)$/);
	const zones = qualifiers(title);
	if (trailing?.[1]) zones.push(trailing[1]);

	// And some arrive with no punctuation at all — "Chura Liya Hai Tumne Jo Dil
	// Ko LoFi Flip".
	//
	// The last two words, and ONLY when the title is long enough for those two
	// to be a suffix rather than the whole thing. Without that floor the window
	// swallows short titles entirely and "Cover Me" reads as a cover of
	// something — which is exactly what the test written to protect it caught.
	const all = words(title);
	if (all.length >= 4) zones.push(all.slice(-2).join(" "));

	return zones.some((zone) => {
		const parts = words(zone);
		return parts.length > 0 && parts.some((word) => VARIANT_WORDS.has(word));
	});
}

/**
 * Durations that are obviously not this song, rather than merely a different
 * arrangement of it.
 *
 * Deliberately blunt: only a factor of two either way. A tighter band would be
 * actively harmful — when a search floods with covers, the MEDIAN duration is
 * the covers', and a narrow window would then reject the original for being
 * unlike the imitations. This is here to catch junk uploads, of which the
 * clearest example measured was a "Creep" running 949 seconds against a real
 * running time of 238.
 */
export function isDurationOutlier(
	duration: number | null,
	median: number | null,
): boolean {
	if (!duration || !median) return false;
	return duration > median * 2 || duration < median / 2;
}

/**
 * The median running time of the candidates, or null when there are too few to
 * mean anything.
 *
 * Three is the floor, and the first version did not have it. With two entries
 * — a real "Creep" at 238s and a junk upload at 949s — the "median" is
 * whichever of the two the sort happens to put in the middle, so the rule
 * fired against the GENUINE track and ranked the junk first. A median needs a
 * middle to be a median; below three samples there is only a pair of numbers
 * and no way to say which one is unusual. Caught by the test written to prove
 * the opposite.
 */
function medianDuration(items: TrackSummary[]): number | null {
	const values = items
		.map((item) => item.duration)
		.filter((value): value is number => typeof value === "number" && value > 0)
		.sort((a, b) => a - b);
	if (values.length < 3) return null;

	const middle = Math.floor(values.length / 2);
	return values.length % 2 === 1
		? (values[middle] ?? null)
		: ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2 || null;
}

/**
 * Compare artist names loosely enough to survive two catalogues' spellings,
 * and no looser.
 *
 * The first version accepted plain substring containment, which let an upload
 * artist-tagged "radiohead creep" claim to be Radiohead and take the boost —
 * so a junk entry outranked the real recording. Containment now has to be
 * whole words AND the two names comparable in length; "radiohead creep" is
 * twice the words of "radiohead" and no longer qualifies.
 */
function sameArtist(a: string, b: string): boolean {
	const fold = (value: string) => words(value).filter((w) => w !== "the");
	const left = fold(a);
	const right = fold(b);
	if (left.length === 0 || right.length === 0) return false;

	const [shorter, longer] =
		left.length <= right.length ? [left, right] : [right, left];
	// A name may pick up one extra word — "Sanam" / "Sanam Band" — but not two.
	if (longer.length > shorter.length + 1) return false;

	return shorter.every((word) => longer.includes(word));
}

export interface RankingContext {
	/**
	 * Who the song is actually by, when we know — looked up from Genius, which
	 * has an editorial catalogue where LRCLIB has uploads. This is the signal
	 * that fixes a cover flood: "lag ja gale" is Lata Mangeshkar, whatever
	 * order five Sanam uploads happen to arrive in.
	 */
	canonicalArtist?: string | null;
}

/** Exported for tests: the ordering is the product decision here. */
export function scoreCandidate(
	item: TrackSummary,
	median: number | null,
	context: RankingContext = {},
): number {
	let score = 0;

	// The strongest signal by a wide margin, and the only one that can tell a
	// faithful cover from the original.
	if (
		context.canonicalArtist &&
		sameArtist(item.artist, context.canonicalArtist)
	) {
		score += 3;
	}

	// An upload that names itself after the song it contains tells us nothing
	// and is usually a bad rip (D-015). Penalised rather than merely
	// unrewarded: it is positive evidence of a careless upload.
	if (item.artist.toLowerCase() === item.title.toLowerCase()) score -= 2;

	if (item.hasSyncedLyrics) score += 0.5;
	if (isVariant(item.title)) score -= 1.5;
	// Heavier than the canonical-artist boost, deliberately. A "Creep" tagged
	// to Radiohead and running 949 seconds against a real 238 is not a
	// Radiohead recording that happens to be long; it is not the song. A
	// correct artist tag must not be able to rescue it.
	if (isDurationOutlier(item.duration, median)) score -= 4;

	return score;
}

/**
 * Best recording first. A stable sort, so LRCLIB's own ordering still decides
 * between entries this has no opinion about.
 */
export function rankTracks(
	items: TrackSummary[],
	context: RankingContext = {},
): TrackSummary[] {
	const median = medianDuration(items);
	return items
		.map((item, index) => ({
			item,
			index,
			score: scoreCandidate(item, median, context),
		}))
		.sort((a, b) => b.score - a.score || a.index - b.index)
		.map((entry) => entry.item);
}
