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
