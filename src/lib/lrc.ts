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

/** Build stanzas from whichever lyric form the track actually has. */
export function buildStanzas(input: {
	syncedLyrics: string | null;
	plainLyrics: string | null;
}): { stanzas: Stanza[]; synced: boolean } {
	if (input.syncedLyrics) {
		const stanzas = toStanzas(parseSyncedLyrics(input.syncedLyrics));
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

/** Index of the stanza active at `seconds`, or -1. Used by auto-scroll (PRD §3.2). */
export function stanzaIndexAt(stanzas: Stanza[], seconds: number): number {
	for (let i = stanzas.length - 1; i >= 0; i--) {
		const stanza = stanzas[i];
		if (stanza?.startTime != null && seconds >= stanza.startTime) return i;
	}
	return -1;
}
