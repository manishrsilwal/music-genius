/**
 * LRC parsing. Pure and isomorphic — no network, no server dependency.
 *
 * LRCLIB returns synced lyrics in LRC format:
 *   [00:00.42] Is this the real life?
 *   [00:04.03] Is this just fantasy?
 *
 * A line may carry several timestamps when a phrase repeats, and blank lines
 * delimit stanzas.
 */

import type { LyricLine, Stanza } from "./types";

/** `[mm:ss.xx]` or `[mm:ss]`, repeated at the head of a line. */
const TIMESTAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/** LRC metadata tags we ignore: [ar:...], [ti:...], [length:...] etc. */
const METADATA_TAG = /^\[[a-z]+:.*\]$/i;

function toSeconds(min: string, sec: string, frac?: string): number {
	const fraction = frac ? Number(`0.${frac}`) : 0;
	return Number(min) * 60 + Number(sec) + fraction;
}

/**
 * Parse LRC text into time-ordered lines.
 * Untimed and metadata lines are dropped; a line with N timestamps yields N entries.
 */
export function parseSyncedLyrics(lrc: string): LyricLine[] {
	const lines: LyricLine[] = [];

	for (const raw of lrc.split(/\r?\n/)) {
		const trimmed = raw.trim();
		if (!trimmed || METADATA_TAG.test(trimmed)) continue;

		TIMESTAMP.lastIndex = 0;
		const stamps: number[] = [];
		let match = TIMESTAMP.exec(trimmed);
		let lastIndex = 0;
		while (match) {
			// Only leading timestamps count; a bracket mid-lyric is just text.
			if (match.index !== lastIndex) break;
			stamps.push(toSeconds(match[1] as string, match[2] as string, match[3]));
			lastIndex = match.index + match[0].length;
			match = TIMESTAMP.exec(trimmed);
		}

		const text = trimmed.slice(lastIndex).trim();
		if (stamps.length === 0) continue;
		for (const time of stamps) lines.push({ time, text });
	}

	return lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

/** Parse unsynced lyrics, preserving blank lines as stanza delimiters. */
export function parsePlainLyrics(plain: string): string[] {
	return plain.split(/\r?\n/).map((line) => line.trim());
}

/**
 * Group lines into stanzas.
 *
 * Blank lines are the delimiter. An instrumental break in LRC appears as a
 * timestamped empty string, which is exactly the signal we want — it both
 * closes a stanza and tells us the break's duration.
 */
export function toStanzas(lines: LyricLine[]): Stanza[] {
	const stanzas: Stanza[] = [];
	let current: LyricLine[] = [];

	const flush = () => {
		if (current.length === 0) return;
		const times = current
			.map((l) => l.time)
			.filter((t): t is number => t !== null);
		stanzas.push({
			id: `stanza-${stanzas.length}`,
			lines: current,
			startTime: times.length > 0 ? Math.min(...times) : null,
			endTime: times.length > 0 ? Math.max(...times) : null,
		});
		current = [];
	};

	for (const line of lines) {
		if (line.text === "") flush();
		else current.push(line);
	}
	flush();

	return withClosedEndTimes(stanzas);
}

/**
 * A stanza's own last timestamp is when its final line *starts*, not when the
 * stanza ends. Auto-scroll needs the real boundary, so extend each stanza to
 * the next one's start.
 */
function withClosedEndTimes(stanzas: Stanza[]): Stanza[] {
	return stanzas.map((stanza, i) => {
		const next = stanzas[i + 1];
		if (stanza.endTime === null || next?.startTime == null) return stanza;
		return { ...stanza, endTime: next.startTime };
	});
}

/**
 * Above this average, the file plainly is not delimited into sections — it is
 * one long run of timed lines with a single trailing blank, if any.
 */
const UNDELIMITED_LINES_PER_STANZA = 8;

/**
 * A pause this long between sung lines is a section break in practice: an
 * instrumental bar, a turnaround, a breath before the next verse.
 */
const GAP_SPLIT_SECONDS = 5;

/**
 * Recover section breaks from timing when the file has no blank lines.
 *
 * Plenty of LRCLIB uploads are a single undelimited run — "Choo Lo" arrives as
 * 38 lines in one 187-second block. Left alone that is one enormous stanza:
 * the scroll-spy has a single target, so the focus effect does nothing and
 * auto-scroll has nowhere to go.
 *
 * Applied ONLY as a fallback. Files that do delimit themselves are left alone,
 * because splitting those on timing would cut across the writer's own sections.
 */
function splitOnGaps(lines: LyricLine[]): Stanza[] {
	const groups: LyricLine[][] = [];
	let current: LyricLine[] = [];

	for (const [index, line] of lines.entries()) {
		const previous = lines[index - 1];
		const gap =
			previous?.time != null && line.time != null
				? line.time - previous.time
				: 0;

		if (current.length > 0 && gap > GAP_SPLIT_SECONDS) {
			groups.push(current);
			current = [];
		}
		current.push(line);
	}
	if (current.length > 0) groups.push(current);

	return groups.flatMap((group) => toStanzas(group));
}

/** Build stanzas from whichever lyric form the track actually has. */
export function buildStanzas(input: {
	syncedLyrics: string | null;
	plainLyrics: string | null;
}): { stanzas: Stanza[]; synced: boolean } {
	if (input.syncedLyrics) {
		const lines = parseSyncedLyrics(input.syncedLyrics);
		let stanzas = toStanzas(lines);

		const sung = lines.filter((line) => line.text !== "");
		if (
			stanzas.length > 0 &&
			sung.length / stanzas.length > UNDELIMITED_LINES_PER_STANZA
		) {
			const bySplit = splitOnGaps(sung);
			if (bySplit.length > stanzas.length) stanzas = renumber(bySplit);
		}

		if (stanzas.length > 0) return { stanzas, synced: true };
	}

	if (input.plainLyrics) {
		const lines = parsePlainLyrics(input.plainLyrics).map((text) => ({
			time: null,
			text,
		}));
		return { stanzas: toStanzas(lines), synced: false };
	}

	return { stanzas: [], synced: false };
}

/** Stanza ids are positional, so regrouping has to reissue them. */
function renumber(stanzas: Stanza[]): Stanza[] {
	return stanzas.map((stanza, index) => ({ ...stanza, id: `stanza-${index}` }));
}

/** Index of the stanza active at `seconds`, or -1. Used by auto-scroll (PRD §3.2). */
export function stanzaIndexAt(stanzas: Stanza[], seconds: number): number {
	for (let i = stanzas.length - 1; i >= 0; i--) {
		const stanza = stanzas[i];
		if (stanza?.startTime != null && seconds >= stanza.startTime) return i;
	}
	return -1;
}

/**
 * Where the song is, to the line (PRD §3.2).
 *
 * Auto-scroll used to track the stanza, which lurched: stanzas run 30–70
 * seconds, so a six-minute song scrolled eight times. Worse, an LRC file with
 * no blank lines collapsed to a single stanza and the page never moved at all.
 * Following the line makes the scroll continuous and works regardless of how
 * the file is delimited.
 *
 * Stanza opacity stays stanza-level — that is PRD §3.3's focus effect, a
 * different concern from keeping pace with the audio.
 */
export interface LinePosition {
	stanzaIndex: number;
	lineIndex: number;
	/** Matches the key the canvas registers its line elements under. */
	key: string;
}

export function lineKey(stanzaIndex: number, lineIndex: number): string {
	return `${stanzaIndex}:${lineIndex}`;
}

export function linePositionAt(
	stanzas: Stanza[],
	seconds: number,
): LinePosition | null {
	for (let s = stanzas.length - 1; s >= 0; s--) {
		const stanza = stanzas[s];
		if (!stanza) continue;

		for (let l = stanza.lines.length - 1; l >= 0; l--) {
			const line = stanza.lines[l];
			if (line?.time != null && seconds >= line.time) {
				return { stanzaIndex: s, lineIndex: l, key: lineKey(s, l) };
			}
		}
	}
	return null;
}

/**
 * Do these timings belong to the recording that is actually playing? (D-075)
 *
 * LRC timestamps are cut against one specific recording — almost always the
 * album audio. Genius, meanwhile, links whichever YouTube upload it considers
 * canonical, which is usually the OFFICIAL VIDEO: a different cut with a
 * cinematic intro and outro. "Blinding Lights" is the reported case — the
 * timings are for the 200-second audio, the linked video runs 263 seconds, and
 * every line lands tens of seconds away from the voice.
 *
 * The two durations are the tell, and both are already in hand: LRCLIB records
 * the duration its timings were made for, and the IFrame player reports what
 * is actually loaded. Anything beyond a few seconds apart is a different cut.
 *
 * Deliberately detection only. The tempting next step — shifting every
 * timestamp by the difference — assumes all the extra time is intro, and an
 * official video splits it between intro and outro in proportions nobody
 * publishes. A sync that is confidently wrong is worse than a canvas that
 * says why it stopped following.
 */
export function timingsDrift(
	playerDuration: number,
	lyricsDuration: number | null,
): boolean {
	// Nothing to compare: LRCLIB omits duration on some uploads, and the
	// player reports 0 until it is ready. Claiming drift on missing data
	// would disable sync for exactly the tracks we know least about.
	if (!lyricsDuration || playerDuration <= 0) return false;

	// 20 seconds, retuned from 7 (D-080). Seven was set against one true
	// positive — a 63-second official-video intro — and then flagged "Choo
	// Lo", where the video runs 234s against LRCLIB's claimed 252s. That is
	// not a different cut; it is uploader-typed metadata being loose, which
	// LRCLIB's duration field routinely is. A false positive here used to be
	// harmless caution; now that it sets the sync DEFAULT, it turns sync off
	// for readers whose timings were fine. Different cuts differ by intros
	// and outros — twenty seconds and up in every case measured; sloppy
	// metadata on the same cut stays under it.
	return Math.abs(playerDuration - lyricsDuration) > 20;
}

/**
 * The lines a stranger should see first (OD-026 → D-077).
 *
 * The social preview used to take the first four lines of the track. For some
 * songs the opening is the weakest or roughest language in the lyric — and a
 * preview is seen by people who did not choose to open the page.
 *
 * The hook is the mechanical alternative: the most-repeated line in a song is
 * almost always its chorus, which is the part the artist chose to say more
 * than once — the line people already know. Repetition is counted on
 * normalised text so "Yeah" / "yeah," collapse, and the window opens at the
 * repeated line's first appearance so the preview reads as a passage rather
 * than as a supercut.
 *
 * Falls back to the opening when nothing repeats — spoken-word pieces and
 * through-composed songs exist, and for them the opening IS the statement.
 */
export function previewLines(stanzas: Stanza[], count: number): string[] {
	const all = stanzas
		.flatMap((stanza) => stanza.lines.map((line) => line.text))
		.map((text) => text.trim())
		.filter(Boolean);
	if (all.length === 0) return [];

	const fold = (value: string) =>
		value
			.toLowerCase()
			.replace(/[^\p{L}\p{N}]+/gu, " ")
			.trim();

	const counts = new Map<string, number>();
	for (const line of all) {
		const key = fold(line);
		if (key.length < 3) continue;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	let hook: string | null = null;
	let best = 1;
	for (const [key, count] of counts) {
		if (count > best) {
			best = count;
			hook = key;
		}
	}

	// Nothing repeats: the opening is the statement.
	if (!hook) return all.slice(0, count);

	const start = all.findIndex((line) => fold(line) === hook);
	return all.slice(Math.max(0, start), start + count);
}
