/**
 * Emits the metric-matched fallback @font-face blocks for src/styles.css.
 *
 *   bun run scripts/generate-font-fallbacks.ts
 *
 * A webfont and the system face standing in for it while it loads are almost
 * never the same width, so when the real face arrives every line re-wraps and
 * every line box changes height. On a hero set at display size that is a lurch,
 * not a settling.
 *
 * Measured from the STATIC packages even though the browser is served the
 * variable ones: opentype.js cannot parse woff2, and the variable builds ship
 * nothing else. Weight 400 of the static cut is the same design, so the metrics
 * are the metrics.
 *
 * `size-adjust` and the `*-override` descriptors let a `local()` fallback be
 * scaled to the webfont's own metrics, so the swap is close to invisible. The
 * fallback costs nothing to fetch — it is a font the reader already has.
 *
 * Run this whenever a display or UI face changes, and paste the output into the
 * marked block in styles.css. Not written directly to the stylesheet: that file
 * is hand-maintained prose as much as code, and a generator that rewrites it
 * would flatten the comments.
 */

import { readFile } from "node:fs/promises";
import opentype from "@shuding/opentype.js";

/**
 * English letter frequency. An unweighted mean treats `z` as being as common
 * as `e` and produces an average width no real sentence has.
 */
const FREQUENCY: Record<string, number> = {
	a: 8.17, b: 1.49, c: 2.78, d: 4.25, e: 12.7, f: 2.23, g: 2.02, h: 6.09,
	i: 6.97, j: 0.15, k: 0.77, l: 4.03, m: 2.41, n: 6.75, o: 7.51, p: 1.93,
	q: 0.1, r: 5.99, s: 6.33, t: 9.06, u: 2.76, v: 0.98, w: 2.36, x: 0.15,
	y: 1.97, z: 0.07, " ": 17.0,
};

interface Metrics {
	label: string;
	avgWidth: number;
	ascent: number;
	descent: number;
	lineGap: number;
}

async function measure(path: string, label: string): Promise<Metrics> {
	const buffer = await readFile(path);
	const font = opentype.parse(
		buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
	);
	const upm = font.unitsPerEm;

	let weighted = 0;
	let total = 0;
	for (const [char, freq] of Object.entries(FREQUENCY)) {
		const glyph = font.charToGlyph(char);
		if (!glyph || glyph.advanceWidth == null) continue;
		weighted += (glyph.advanceWidth / upm) * freq;
		total += freq;
	}

	// biome-ignore lint/suspicious/noExplicitAny: opentype's table types are loose
	const tables = font.tables as any;
	const os2 = tables.os2 ?? {};
	const hhea = tables.hhea ?? {};

	return {
		label,
		avgWidth: weighted / total,
		ascent: (os2.sTypoAscender ?? hhea.ascender) / upm,
		descent: (os2.sTypoDescender ?? hhea.descender) / upm,
		lineGap: (os2.sTypoLineGap ?? hhea.lineGap ?? 0) / upm,
	};
}

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

function block(family: string, local: string, web: Metrics, fallback: Metrics) {
	const sizeAdjust = web.avgWidth / fallback.avgWidth;
	return `@font-face {
  font-family: "${family}";
  src: local("${local}");
  size-adjust: ${pct(sizeAdjust)};
  ascent-override: ${pct(web.ascent / sizeAdjust)};
  descent-override: ${pct(Math.abs(web.descent) / sizeAdjust)};
  line-gap-override: ${pct(web.lineGap / sizeAdjust)};
  unicode-range: U+0000-00FF, U+0100-02BA, U+2000-206F;
}`;
}

const SYSTEM = "/System/Library/Fonts/Supplemental";

const display = await measure(
	"node_modules/@fontsource/fraunces/files/fraunces-latin-400-normal.woff",
	"Fraunces",
);
const ui = await measure(
	"node_modules/@fontsource/outfit/files/outfit-latin-400-normal.woff",
	"Outfit",
);
const georgia = await measure(`${SYSTEM}/Georgia.ttf`, "Georgia");
const times = await measure(`${SYSTEM}/Times New Roman.ttf`, "Times New Roman");
const arial = await measure(`${SYSTEM}/Arial.ttf`, "Arial");

console.log("/* Measured mismatch, before adjustment: */");
for (const [web, fb] of [
	[display, georgia],
	[display, times],
	[ui, arial],
] as const) {
	const off = (web.avgWidth / fb.avgWidth - 1) * 100;
	console.log(`/*   ${web.label} vs ${fb.label}: ${off.toFixed(1)}% wider */`);
}
console.log();
console.log(block("Display Fallback Georgia", "Georgia", display, georgia));
console.log();
console.log(block("Display Fallback Times", "Times New Roman", display, times));
console.log();
console.log(block("UI Fallback", "Arial", ui, arial));
