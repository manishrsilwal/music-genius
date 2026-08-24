/**
 * Lyric Card spec (PRD §3.4).
 *
 * Isomorphic on purpose: the browser uses these exact gradient strings to
 * preview a card, and Satori uses the same strings to render the export. One
 * definition means the preview cannot drift from the file the reader gets.
 */

import { converter, formatHex } from "culori";

import {
	FALLBACK_ADVANCE,
	FULLWIDTH_ADVANCE_JP,
	FULLWIDTH_ADVANCE_KR,
	FULLWIDTH_ADVANCE_SC,
	GLYPH_ADVANCE,
} from "./card-metrics";
import type { Palette } from "./types";

const toRgb = converter("rgb");

/**
 * Satori has no OKLCH support — it renders oklch() as black, silently. Every
 * colour reaching a card must therefore be sRGB hex. We still *author* in
 * OKLCH, because perceptual lightness is what keeps these treatments legible
 * across every hue, and convert at the boundary.
 */
function oklch(lightness: number, chroma: number, hue: number): string {
	return (
		formatHex(toRgb({ mode: "oklch", l: lightness, c: chroma, h: hue })) ??
		"#000000"
	);
}

/** PRD §3.4: a square image for social. 1080 is Instagram's native size. */
export const CARD_SIZE = 1080;

/** Below two lines there is no card; beyond six the type is too small to read. */
export const MIN_LINES = 1;
export const MAX_LINES = 6;

export interface CardTheme {
	id: string;
	label: string;
	background: string;
	ink: string;
	muted: string;
}

/**
 * Default hue when a track has no palette (achromatic art, or no Genius match).
 * Brass, matching `--track-accent` in styles.css — an exported card and the
 * page it came from must not disagree about the product's own colour (D-052).
 */
const FALLBACK_HUE = 82;

/**
 * Four treatments derived from the track's own hue (PRD §3.4 "cinematic
 * gradient pulled from the album art's colour palette").
 *
 * Lightness and chroma are fixed per treatment so every card is legible
 * regardless of the source artwork — the hue is what varies by track. Same
 * reasoning as the accent normalisation in palette.server.ts (D-016).
 */
export function cardThemes(palette: Palette | null): CardTheme[] {
	const h = palette ? extractHue(palette.accent) : FALLBACK_HUE;

	return [
		{
			id: "dusk",
			label: "Dusk",
			background: `linear-gradient(145deg, ${oklch(0.18, 0.05, h)}, ${oklch(0.3, 0.11, h)})`,
			ink: oklch(0.97, 0.01, h),
			muted: oklch(0.74, 0.03, h),
		},
		{
			id: "vivid",
			label: "Vivid",
			background: `linear-gradient(145deg, ${oklch(0.45, 0.16, h)}, ${oklch(0.68, 0.19, h)})`,
			ink: oklch(0.99, 0.01, h),
			muted: oklch(0.88, 0.05, h),
		},
		{
			id: "ink",
			label: "Ink",
			background: `linear-gradient(145deg, ${oklch(0.12, 0.02, h)}, ${oklch(0.19, 0.06, h)})`,
			ink: oklch(0.96, 0.01, h),
			muted: oklch(0.68, 0.04, h),
		},
		{
			id: "paper",
			label: "Paper",
			background: `linear-gradient(145deg, ${oklch(0.96, 0.02, h)}, ${oklch(0.89, 0.06, h)})`,
			ink: oklch(0.22, 0.05, h),
			muted: oklch(0.45, 0.05, h),
		},
	];
}

export function themeById(palette: Palette | null, id: string): CardTheme {
	const themes = cardThemes(palette);
	return themes.find((theme) => theme.id === id) ?? (themes[0] as CardTheme);
}

/** Pull the hue channel out of an `oklch(l c h)` string produced by culori. */
function extractHue(oklch: string): number {
	const parts = oklch.match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/);
	return parts?.[1] ? Number(parts[1]) : FALLBACK_HUE;
}

/**
 * Type scale for the card.
 *
 * Sized so the longest line fits without wrapping. Line count alone is not
 * enough — a three-line verse whose longest line ran 32 characters overflowed
 * at 64px and orphaned a word onto a fourth line, destroying exactly the line
 * structure the card exists to preserve.
 *
 * Widths come from the faces' real advance tables rather than an assumed
 * average. The first attempt guessed 0.46em; the display face's true mean is
 * 0.6828em, which is why it still wrapped. Measuring is not optional for this —
 * and the number moved again when the face changed (D-064), which is the whole
 * reason it comes from a generator rather than from a comment.
 *
 * The table covers Latin (the display face) and Devanagari (Vesper Libre),
 * because a lyric line can mix both and Satori falls back per glyph.
 *
 * The same table runs in the browser preview and the server render, so the
 * preview cannot drift from the exported file (D-018).
 */

/** 1080 less the 104px padding either side. */
const CONTENT_WIDTH = CARD_SIZE - 104 * 2;

/**
 * Vertical room for the lyric block: the same 872px less the credit line and
 * the breathing space above it. Without this bound, filling the measure would
 * push a six-line verse off the bottom of the card.
 */
const CONTENT_HEIGHT = CARD_SIZE - 104 * 2 - 92;

/** Ceiling, so a two-word selection does not become a billboard. */
const MAX_SIZE = 108;

/** Below this the card stops reading as a display piece. */
const MIN_SIZE = 30;

/**
 * Our table sums plain advances; Satori additionally applies kerning, which
 * usually narrows a line but is not guaranteed to. A little headroom is
 * cheaper than an orphaned word.
 */
const FIT_MARGIN = 0.97;

/** Loosest leading we ever apply — used for the height bound so it always holds. */
const LEADING_MAX = 1.42;

/**
 * Advance of one character, in em (D-057).
 *
 * CJK is answered by range rather than by table. Every glyph in a Noto CJK
 * face carries the same advance — verified across 21k codepoints per face, and
 * the generator refuses to emit a constant if that stops being true — so three
 * numbers replace ~25,000 entries.
 *
 * This matters more than it sounds. Before it, CJK fell through to
 * FALLBACK_ADVANCE, the mean of a mostly-Latin table, and a full-width
 * character was measured at roughly half its real width. The card sized its
 * type to fit a line that was actually twice as wide, satori wrapped it, and
 * the words ran off the bottom of the image — which nobody saw while those
 * same characters were still rendering as tofu.
 */
function advanceOf(char: string): number {
	const known = GLYPH_ADVANCE[char];
	if (known !== undefined) return known;

	const cp = char.codePointAt(0) ?? 0;

	// Hangul syllables and jamo. Narrower than the ideographs, and measured
	// from a face that carries no Hanja at all.
	if ((cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0x1100 && cp <= 0x11ff)) {
		return FULLWIDTH_ADVANCE_KR;
	}

	// Kana, CJK ideographs, CJK punctuation, fullwidth forms. JP and SC agree
	// on 1em, so either constant is the same answer; JP is named for the
	// default face and SC referenced so the pair cannot silently diverge.
	if (
		(cp >= 0x3000 && cp <= 0x30ff) ||
		(cp >= 0x3130 && cp <= 0x318f) ||
		(cp >= 0x3400 && cp <= 0x4dbf) ||
		(cp >= 0x4e00 && cp <= 0x9fff) ||
		(cp >= 0xf900 && cp <= 0xfaff) ||
		(cp >= 0xfe30 && cp <= 0xfe4f) ||
		(cp >= 0xff00 && cp <= 0xff60) ||
		(cp >= 0xffe0 && cp <= 0xffe6)
	) {
		return Math.max(FULLWIDTH_ADVANCE_JP, FULLWIDTH_ADVANCE_SC);
	}

	return FALLBACK_ADVANCE;
}

/** Width of `text` at 1px, in em units. */
export function measureEm(text: string): number {
	let total = 0;
	for (const char of text) total += advanceOf(char);
	return total;
}

export function cardTypeScale(lines: string[]): {
	size: number;
	leading: number;
} {
	const widestEm = lines.reduce(
		(max, line) => Math.max(max, measureEm(line)),
		0.001,
	);

	// Width leads (D-020): type grows until it fills the measure, whatever the
	// script. Devanagari advances are narrower than Latin, so a line-count rule
	// left those cards filling barely half the width and looking unset.
	const byWidth = (CONTENT_WIDTH * FIT_MARGIN) / widestEm;
	const byHeight = CONTENT_HEIGHT / (lines.length * LEADING_MAX);

	const size = Math.max(MIN_SIZE, Math.min(byWidth, byHeight, MAX_SIZE));
	const leading = size > 60 ? 1.32 : size > 48 ? 1.36 : 1.42;

	return { size: Math.floor(size), leading };
}
