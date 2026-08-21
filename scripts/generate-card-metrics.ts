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
 * Both faces are measured, because a lyric line can mix scripts and Satori
 * falls back per glyph. Combining marks (nuqta, some matras) carry advance 0
 * in the font, so they contribute nothing here — which is correct.
 *
 * Note conjunct ligatures render NARROWER than the sum of their parts, so this
 * table over-estimates Devanagari slightly. That errs toward type that is a
 * little small rather than type that overflows, which is the safe direction.
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
		// Latin display face.
		path: "node_modules/@fontsource/rufina/files/rufina-latin-400-normal.woff",
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

const body = `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: bun run scripts/generate-card-metrics.ts
 *
 * Advance widths in em units for the Lyric Card display faces — Rufina for
 * Latin, Vesper Libre for Devanagari. Used to size card type so lines never
 * wrap (ARCHITECTURE.md D-018).
 *
 * Combining marks carry 0 here because that is their real advance.
 */

/** Mean advance, used for any character outside the table. */
export const FALLBACK_ADVANCE = ${fallback};

export const GLYPH_ADVANCE: Record<string, number> = ${JSON.stringify(widths, null, 0)};
`;

await Bun.write(OUT, body);
console.log(`  wrote ${OUT}: ${Object.keys(widths).length} glyphs, fallback ${fallback}em`);
