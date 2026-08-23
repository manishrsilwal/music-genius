/**
 * Regenerates src/lib/card-metrics.ts from the card's font binaries.
 *
 * Run when a display face changes:
 *   bun run scripts/generate-card-metrics.ts
 *
 * Card type is sized to fit without wrapping, and that needs real advance
 * widths — an assumed average was wrong enough to orphan words onto extra
 * lines. Embedding a table keeps the maths identical in the browser preview
 * and the server render, with no font parsing at runtime on either side.
 *
 * Every face is measured, because a lyric line can mix scripts and Satori
 * falls back per glyph. Combining marks (nuqta, some matras) carry advance 0
 * in the font, so they contribute nothing here — which is correct.
 *
 * Note conjunct ligatures render NARROWER than the sum of their parts, so this
 * table over-estimates Devanagari slightly. Arabic is over-estimated for a
 * related reason: the cmap gives the isolated form, and joined medial forms are
 * narrower. Both err toward type that is a little small rather than type that
 * overflows, which is the safe direction.
 *
 * CJK is NOT enumerated (D-057). Every glyph in a Noto CJK face carries the
 * same advance — measured across 21k codepoints per face: 1em in JP and SC,
 * 0.966em in KR — so three constants replace ~25,000 table entries. Those are
 * emitted from the measurement rather than typed, so a font update moves them.
 */

import { readFile } from "node:fs/promises";
import opentype from "@shuding/opentype.js";

interface Source {
	path: string;
	/** Inclusive codepoint ranges to sample. */
	ranges: Array<[number, number]>;
}

const SOURCES: Source[] = [
	{
		// Latin display face (D-064).
		path: "node_modules/@fontsource/fraunces/files/fraunces-latin-400-normal.woff",
		ranges: [[0x20, 0x7e]],
	},
	{
		// Devanagari companion.
		path: "node_modules/@fontsource/vesper-libre/files/vesper-libre-devanagari-400-normal.woff",
		ranges: [
			[0x0900, 0x097f],
			[0x200c, 0x200d], // ZWNJ / ZWJ — control conjunct formation
		],
	},
	// The D-057 companions. Each is a single small block, so enumerating them
	// costs a few hundred entries and buys real widths instead of the Latin
	// mean — which is what made a Tamil card size itself as though it were
	// English.
	{
		path: "node_modules/@fontsource/amiri/files/amiri-arabic-400-normal.woff",
		ranges: [[0x0600, 0x06ff]],
	},
	{
		path: "node_modules/@fontsource/noto-serif-bengali/files/noto-serif-bengali-bengali-400-normal.woff",
		ranges: [[0x0980, 0x09ff]],
	},
	{
		path: "node_modules/@fontsource/noto-serif-gurmukhi/files/noto-serif-gurmukhi-gurmukhi-400-normal.woff",
		ranges: [[0x0a00, 0x0a7f]],
	},
	{
		path: "node_modules/@fontsource/noto-serif-gujarati/files/noto-serif-gujarati-gujarati-400-normal.woff",
		ranges: [[0x0a80, 0x0aff]],
	},
	{
		path: "node_modules/@fontsource/noto-serif-tamil/files/noto-serif-tamil-tamil-400-normal.woff",
		ranges: [[0x0b80, 0x0bff]],
	},
	{
		path: "node_modules/@fontsource/noto-serif-telugu/files/noto-serif-telugu-telugu-400-normal.woff",
		ranges: [[0x0c00, 0x0c7f]],
	},
	{
		path: "node_modules/@fontsource/noto-serif-kannada/files/noto-serif-kannada-kannada-400-normal.woff",
		ranges: [[0x0c80, 0x0cff]],
	},
	{
		path: "node_modules/@fontsource/noto-serif-malayalam/files/noto-serif-malayalam-malayalam-400-normal.woff",
		ranges: [[0x0d00, 0x0d7f]],
	},
	{
		path: "node_modules/@fontsource/noto-serif-thai/files/noto-serif-thai-thai-400-normal.woff",
		ranges: [[0x0e01, 0x0e5b]],
	},
	{
		path: "node_modules/@fontsource/noto-serif-hebrew/files/noto-serif-hebrew-hebrew-400-normal.woff",
		ranges: [[0x0590, 0x05ff]],
	},
	{
		path: "node_modules/@fontsource/noto-serif/files/noto-serif-cyrillic-400-normal.woff",
		ranges: [
			[0x0400, 0x045f],
			[0x0490, 0x0491],
		],
	},
	{
		path: "node_modules/@fontsource/noto-serif/files/noto-serif-greek-400-normal.woff",
		ranges: [[0x0370, 0x03ff]],
	},
];

/**
 * CJK faces, measured for a single uniform advance rather than enumerated.
 * The generator asserts the uniformity it assumes.
 */
const WIDE_SOURCES = [
	{
		name: "FULLWIDTH_ADVANCE_JP",
		path: "node_modules/@fontsource/noto-serif-jp/files/noto-serif-jp-japanese-400-normal.woff",
		ranges: [
			[0x3040, 0x30ff],
			[0x4e00, 0x9fff],
		] as Array<[number, number]>,
	},
	{
		name: "FULLWIDTH_ADVANCE_SC",
		path: "node_modules/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff",
		ranges: [[0x4e00, 0x9fff]] as Array<[number, number]>,
	},
	{
		name: "FULLWIDTH_ADVANCE_KR",
		path: "node_modules/@fontsource/noto-serif-kr/files/noto-serif-kr-korean-400-normal.woff",
		ranges: [[0xac00, 0xd7a3]] as Array<[number, number]>,
	},
];

const OUT = "src/lib/card-metrics.ts";

const widths: Record<string, number> = {};
let total = 0;
let counted = 0;

for (const source of SOURCES) {
	const buffer = await readFile(source.path);
	const font = opentype.parse(
		buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
	);

	for (const [start, end] of source.ranges) {
		for (let code = start; code <= end; code++) {
			const char = String.fromCodePoint(code);
			const glyph = font.charToGlyph(char);
			// index 0 is .notdef — the font has no such glyph.
			if (!glyph || glyph.index === 0 || glyph.advanceWidth == null) continue;

			const width = glyph.advanceWidth / font.unitsPerEm;
			widths[char] = Number(width.toFixed(4));
			if (width > 0) {
				total += width;
				counted++;
			}
		}
	}
}

const fallback = Number((total / counted).toFixed(4));

/**
 * Measure one uniform advance per CJK face, and refuse to emit a constant that
 * is not actually uniform — the whole reason three numbers can stand in for
 * ~25,000 table entries.
 */
const wide: Record<string, number> = {};
for (const source of WIDE_SOURCES) {
	const buffer = await readFile(source.path);
	const font = opentype.parse(
		buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
	);

	const seen = new Map<number, number>();
	for (const [start, end] of source.ranges) {
		for (let code = start; code <= end; code++) {
			const glyph = font.charToGlyph(String.fromCodePoint(code));
			if (!glyph || glyph.index === 0 || glyph.advanceWidth == null) continue;
			const width = Number((glyph.advanceWidth / font.unitsPerEm).toFixed(4));
			// Two zero-advance glyphs exist in JP; they are combining and correct.
			if (width === 0) continue;
			seen.set(width, (seen.get(width) ?? 0) + 1);
		}
	}

	const widths = [...seen.entries()].sort((a, b) => b[1] - a[1]);
	if (widths.length === 0) {
		throw new Error(`${source.name}: no glyphs measured`);
	}
	if (widths.length > 1) {
		throw new Error(
			`${source.name}: advances are not uniform — ${widths
				.map(([w, n]) => `${w}em x${n}`)
				.join(", ")}. The range rule in card.ts is no longer valid.`,
		);
	}

	const [[value, count]] = widths;
	wide[source.name] = value;
	console.log(`  ${source.name}: ${value}em across ${count} glyphs`);
}

const body = `/**
 * biome-ignore-all lint/suspicious/noApproximativeNumericConstant: these are
 * measured font advance widths. One of them landing near a math constant is a
 * coincidence of the typeface, not a mistyped Math.SQRT1_2.
 */

/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: bun run scripts/generate-card-metrics.ts
 *
 * Advance widths in em units for the Lyric Card display faces (D-018, D-057).
 * Used to size card type so lines never wrap.
 *
 * Combining marks carry 0 here because that is their real advance.
 *
 * CJK is not enumerated: every glyph in a Noto CJK face shares one advance, so
 * three constants stand in for ~25,000 entries. card.ts applies them by range.
 */

/** Mean advance, used for any character outside the table. */
export const FALLBACK_ADVANCE = ${fallback};

/**
 * CJK advances are uniform per face, so they are constants rather than table
 * entries (D-057). The generator throws if a face stops being uniform.
 */
export const FULLWIDTH_ADVANCE_JP = ${wide.FULLWIDTH_ADVANCE_JP};
export const FULLWIDTH_ADVANCE_SC = ${wide.FULLWIDTH_ADVANCE_SC};
export const FULLWIDTH_ADVANCE_KR = ${wide.FULLWIDTH_ADVANCE_KR};

export const GLYPH_ADVANCE: Record<string, number> = ${JSON.stringify(widths, null, 0)};
`;

await Bun.write(OUT, body);
console.log(`  wrote ${OUT}: ${Object.keys(widths).length} glyphs, fallback ${fallback}em`);
