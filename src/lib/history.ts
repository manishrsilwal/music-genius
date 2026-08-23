/**
 * Reading history (D-056).
 *
 * The product remembered exactly one thing about a reader — three taste
 * answers — so a track they read yesterday was reachable only by searching for
 * it again by name. This is the smallest fix for that: what you opened, newest
 * first, in your own browser.
 *
 * Pure functions over an array. Storage lives in the hook; everything that can
 * be wrong about the data can be decided here, and tested.
 */

/** Enough to be a shelf, few enough not to become a list to manage. */
export const HISTORY_LIMIT = 5;

export interface HistoryEntry {
	/** LRCLIB id — the route parameter, so a row can link without a lookup. */
	id: string;
	title: string;
	artist: string;
}

/**
 * Deliberately no scroll position. Lyric lines reflow with viewport width and
 * with the drawer being open, so a stored offset points somewhere different on
 * the next visit — and being returned to roughly-but-not-quite where you left
 * off is worse than starting at the top of a page you chose to reopen.
 */

/**
 * Record a visit. Newest first, one entry per track, capped.
 *
 * Re-reading something moves it to the front rather than duplicating it: the
 * shelf answers "what was I reading", and a track read three times is still
 * one answer.
 */
export function recordVisit(
	entries: HistoryEntry[],
	entry: HistoryEntry,
): HistoryEntry[] {
	if (!entry.id) return entries;
	const rest = entries.filter((item) => item.id !== entry.id);
	return [entry, ...rest].slice(0, HISTORY_LIMIT);
}

/** Drop one track. Reading history is personal; removing a row is not a setting. */
export function removeVisit(
	entries: HistoryEntry[],
	id: string,
): HistoryEntry[] {
	return entries.filter((item) => item.id !== id);
}

/**
 * Parse whatever is in storage.
 *
 * Untrusted by the same reasoning as `parsePreferences`: it is user-writable,
 * it survives across versions of this code, and a malformed entry rendered raw
 * would put arbitrary strings on the page. Anything that is not a complete
 * entry is dropped rather than repaired — a row with no title is not a row.
 */
export function parseHistory(raw: string | null): HistoryEntry[] {
	if (!raw) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];

	const seen = new Set<string>();
	const entries: HistoryEntry[] = [];

	for (const item of parsed) {
		if (!item || typeof item !== "object") continue;
		const { id, title, artist } = item as Record<string, unknown>;
		if (
			typeof id !== "string" ||
			typeof title !== "string" ||
			typeof artist !== "string"
		) {
			continue;
		}
		const trimmed = id.trim();
		// A duplicate id would render two rows linking to the same track and
		// break React's key invariant.
		if (!trimmed || !title.trim() || seen.has(trimmed)) continue;
		seen.add(trimmed);
		entries.push({ id: trimmed, title, artist });
	}

	return entries.slice(0, HISTORY_LIMIT);
}
