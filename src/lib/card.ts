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
	LOUD_FALLBACK_ADVANCE,
	LOUD_GLYPH_ADVANCE,
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
	/**
	 * The loud card's chrome (D-132, second round). Only loud themes carry
	 * it: the treatment paints the PANEL — the card's own body — and the
	 * sticker and frame re-derive per fill, while the ground under the
	 * panel stays the product's one warm surface.
	 */
	loud?: {
		ground: string;
		frame: string;
		shadow: string;
		sticker: string;
		stickerInk: string;
	};
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

/**
 * Which cut the card is dressed for (D-132). The classic card is v1's —
 * palette-derived gradients. The loud card is v2's: a white panel with a
 * hard black frame and offset shadow on a flat bright ground, the brand
 * as a tilted rose sticker. Same lines, same scale maths, two grammars.
 */
export type CardVariant = "classic" | "loud";

/**
 * The loud card's treatments (owner's second ruling): the swatch changes
 * the CARD — `background` is the panel fill, the dominant surface — and
 * every other colour re-derives from it: ink and credit for contrast on
 * that fill, the sticker in a colourway that pops against it. The ground
 * under the panel is the one thing that never changes: the product's own
 * warm canvas, so the card always looks lifted off a Refrain page.
 */
export function loudThemes(): CardTheme[] {
	const ground = "#fff1f2";
	return [
		{
			id: "loud-white",
			label: "White card",
			background: "#ffffff",
			ink: "#0a0a0a",
			muted: "#475569",
			loud: {
				ground,
				frame: "#0a0a0a",
				shadow: "#0a0a0a",
				sticker: "#e11d48",
				stickerInk: "#ffffff",
			},
		},
		{
			id: "loud-honey",
			label: "Honey card",
			background: "#fde68a",
			ink: "#0a0a0a",
			// Warm brown, not slate: the credit has to read as part of the
			// honey world, and still clears the fill by a wide margin.
			muted: "#78350f",
			loud: {
				ground,
				frame: "#0a0a0a",
				shadow: "#0a0a0a",
				sticker: "#0a0a0a",
				stickerInk: "#fde68a",
			},
		},
		{
			id: "loud-rose",
			label: "Rose card",
			background: "#e11d48",
			ink: "#ffffff",
			// Black, not a pale rose: at credit size a tint fails contrast
			// on this fill; black clears it and stays in the palette.
			muted: "#0a0a0a",
			loud: {
				ground,
				frame: "#0a0a0a",
				shadow: "#0a0a0a",
				sticker: "#ffffff",
				stickerInk: "#e11d48",
			},
		},
		{
			id: "loud-black",
			label: "Black card",
			background: "#0a0a0a",
			ink: "#ffffff",
			muted: "#fda4af",
			loud: {
				ground,
				frame: "#0a0a0a",
				shadow: "#0a0a0a",
				sticker: "#e11d48",
				stickerInk: "#ffffff",
			},
		},
	];
}

export function themesFor(
	variant: CardVariant,
	palette: Palette | null,
): CardTheme[] {
	return variant === "loud" ? loudThemes() : cardThemes(palette);
}

export function themeById(
	palette: Palette | null,
	id: string,
	variant: CardVariant = "classic",
): CardTheme {
	const themes = themesFor(variant, palette);
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
 * The card's shape (owner's ask): square for feeds — Instagram's native
 * 1080 — and story for the 9:16 canvas an Instagram story fills. Width
 * stays 1080 in both, so every width-relative ratio (the preview's cqw
 * sizing included) holds across formats.
 */
export type CardFormat = "square" | "story";

export const CARD_DIMS: Record<CardFormat, { width: number; height: number }> =
	{
		square: { width: CARD_SIZE, height: CARD_SIZE },
		story: { width: CARD_SIZE, height: 1920 },
	};

/**
 * The box the LINES must fit, by grammar and shape (D-132). Classic
 * spends 104 a side plus the credit's 92; loud spends 130 a side (48
 * ground + 10 frame + 72 padding) plus 180 for the sticker row and
 * credit. One function, shared by preview and render — the D-018
 * contract — and the square numbers are exactly the constants the
 * classic card has always used.
 */
export function cardMeasure(
	variant: CardVariant,
	format: CardFormat,
): { width: number; height: number } {
	const dims = CARD_DIMS[format];
	return variant === "loud"
		? { width: dims.width - 260, height: dims.height - 260 - 180 }
		: { width: dims.width - 208, height: dims.height - 208 - 92 };
}

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
function fullwidthAdvance(cp: number): number | null {
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

	return null;
}

function advanceOf(char: string): number {
	const known = GLYPH_ADVANCE[char];
	if (known !== undefined) return known;
	return fullwidthAdvance(char.codePointAt(0) ?? 0) ?? FALLBACK_ADVANCE;
}

/**
 * The loud card's advance (D-132): Epilogue 700 for Latin — the measured
 * table — and past Latin exactly what the classic uses, because the loud
 * card falls back to the same companion faces per glyph.
 */
function loudAdvanceOf(char: string): number {
	const loud = LOUD_GLYPH_ADVANCE[char];
	if (loud !== undefined) return loud;
	const companion = GLYPH_ADVANCE[char];
	if (companion !== undefined) return companion;
	return fullwidthAdvance(char.codePointAt(0) ?? 0) ?? LOUD_FALLBACK_ADVANCE;
}

/** Width of `text` at 1px, in em units. */
export function measureEm(text: string): number {
	let total = 0;
	for (const char of text) total += advanceOf(char);
	return total;
}

export function cardTypeScale(
	lines: string[],
	/** The box the lines must fit — the loud card passes its own (D-132). */
	measure: { width: number; height: number } = {
		width: CONTENT_WIDTH,
		height: CONTENT_HEIGHT,
	},
): {
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
	const byWidth = (measure.width * FIT_MARGIN) / widestEm;
	const byHeight = measure.height / (lines.length * LEADING_MAX);

	const size = Math.max(MIN_SIZE, Math.min(byWidth, byHeight, MAX_SIZE));
	const leading = size > 60 ? 1.32 : size > 48 ? 1.36 : 1.42;

	return { size: Math.floor(size), leading };
}

/**
 * The loud card's ceiling sits above the classic's: its face is a heavy
 * condensed-adjacent sans and its whole grammar is a poster's, so a short
 * selection is allowed to be a billboard.
 */
const LOUD_MAX_SIZE = 128;

/** Tighter than the classic's — Epilogue 700 at poster size wants less air. */
function loudLeading(size: number): number {
	return size > 72 ? 1.16 : size > 48 ? 1.22 : 1.3;
}

/** Greedy word-wrap: how many rows `line` takes at `size` in `width` px. */
function wrappedRows(line: string, size: number, width: number): number {
	const words = line.split(/\s+/).filter(Boolean);
	if (words.length === 0) return 1;
	const space = loudAdvanceOf(" ") * size;

	let rows = 1;
	let used = 0;
	for (const word of words) {
		const w = measureEmLoud(word) * size;
		const extended = used === 0 ? w : used + space + w;
		if (extended <= width) {
			used = extended;
		} else {
			rows += 1;
			used = w;
		}
	}
	return rows;
}

/** Width of `text` at 1px in the LOUD face's em units. */
export function measureEmLoud(text: string): number {
	let total = 0;
	for (const char of text) total += loudAdvanceOf(char);
	return total;
}

/**
 * Type scale for the LOUD card (D-132, owner's report): the classic scale
 * forbids wrapping — the line structure IS the writing — which floors one
 * long line to tiny type. The loud card is a poster, and a poster wraps:
 * size is the largest at which no single word overflows the measure and
 * every selected line's wrapped rows still fit the height. Selected lines
 * keep their own blocks; only within a line does the text flow.
 *
 * Walked downward a pixel at a time rather than solved in closed form:
 * the row count is a step function of size, and the search is at most a
 * hundred cheap iterations run once per keystroke-less modal.
 */
export function loudTypeScale(
	lines: string[],
	measure: { width: number; height: number },
): { size: number; leading: number } {
	const usable = measure.width * FIT_MARGIN;
	const widestWordEm = lines
		.flatMap((line) => line.split(/\s+/))
		.filter(Boolean)
		.reduce((max, word) => Math.max(max, measureEmLoud(word)), 0.001);

	const fits = (size: number): boolean => {
		if (widestWordEm * size > usable) return false;
		let rows = 0;
		for (const line of lines) {
			rows += line.trim() ? wrappedRows(line, size, usable) : 1;
		}
		return rows * size * loudLeading(size) <= measure.height;
	};

	let size = LOUD_MAX_SIZE;
	while (size > MIN_SIZE && !fits(size)) size -= 1;

	return { size, leading: loudLeading(size) };
}
