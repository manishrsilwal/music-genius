/**
 * Regenerates src/lib/card-metrics.ts from the Rufina font binary.
 *
 * Run when the display face changes:
 *   bun run scripts/generate-card-metrics.ts
 *
 * Card type is sized to fit without wrapping, and that needs real advance
 * widths — an assumed average was wrong enough to orphan words onto extra
 * lines. Embedding a table keeps the maths identical in the browser preview
 * and the server render, with no font parsing at runtime on either side.
 */

import { readFile } from "node:fs/promises";
import opentype from "@shuding/opentype.js";

const FONT = "node_modules/@fontsource/rufina/files/rufina-latin-400-normal.woff";
const OUT = "src/lib/card-metrics.ts";

const buffer = await readFile(FONT);
const font = opentype.parse(
	buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
);

const widths: Record<string, number> = {};
let total = 0;
let counted = 0;

for (let code = 32; code <= 126; code++) {
	const char = String.fromCharCode(code);
	const glyph = font.charToGlyph(char);
	if (!glyph || glyph.advanceWidth == null) continue;
	// Normalise to em units so the table is font-size independent.
	const width = glyph.advanceWidth / font.unitsPerEm;
	widths[char] = Number(width.toFixed(4));
	total += width;
	counted++;
}

const fallback = Number((total / counted).toFixed(4));

const body = `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate with: bun run scripts/generate-card-metrics.ts
 *
 * Rufina advance widths in em units, for printable ASCII. Used to size Lyric
 * Card type so lines never wrap (ARCHITECTURE.md D-018).
 */

/** Average advance, used for any character outside the table. */
export const FALLBACK_ADVANCE = ${fallback};

export const RUFINA_ADVANCE: Record<string, number> = ${JSON.stringify(widths, null, 1)};
`;

await Bun.write(OUT, body);
console.log(`  wrote ${OUT}: ${counted} glyphs, fallback ${fallback}em`);
