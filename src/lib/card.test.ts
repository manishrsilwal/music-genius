import { describe, expect, it } from "vitest";

import {
	CARD_SIZE,
	cardThemes,
	cardTypeScale,
	measureEm,
	themeById,
} from "./card";

/** Mirrors the renderer: 1080 less 104px padding either side. */
const CONTENT_WIDTH = CARD_SIZE - 104 * 2;
/** ...less the credit line and its breathing space. */
const CONTENT_HEIGHT = CARD_SIZE - 104 * 2 - 92;

function fits(lines: string[]) {
	const { size, leading } = cardTypeScale(lines);
	const widest = Math.max(...lines.map(measureEm)) * size;
	return {
		size,
		widthOk: widest <= CONTENT_WIDTH,
		heightOk: lines.length * size * leading <= CONTENT_HEIGHT,
	};
}

describe("measureEm", () => {
	it("sums real advance widths, not a character count", () => {
		// If this were count-based, "lll" and "mmm" would measure the same.
		expect(measureEm("lll")).not.toBeCloseTo(measureEm("mmm"));
		expect(measureEm("mmm")).toBeGreaterThan(measureEm("lll"));
	});

	it("treats Devanagari combining marks as zero-width", () => {
		// The nuqta has a real advance of 0 in the font; adding it must not
		// widen the string.
		expect(measureEm("क़")).toBeCloseTo(measureEm("क"), 5);
	});

	it("handles mixed scripts", () => {
		expect(measureEm("दिल में hope")).toBeGreaterThan(0);
	});
});

describe("cardTypeScale", () => {
	it("never overflows the measure, whatever the content", () => {
		const cases: string[][] = [
			["Is this the real life?", "Is this just fantasy?"],
			[
				"Mama, just killed a man",
				"Put a gun against his head",
				"Pulled my trigger, now he's dead",
			],
			[
				"खड़ा हूँ आज भी वहीं",
				"कि दिल फिर बेक़रार है",
				"खड़ा हूँ आज भी वहीं",
				"कि तेरा इंतज़ार है",
			],
			["दिल में hope है still", "Is this the real life?"],
			["a", "b", "c", "d", "e", "f"],
			["A very very long single line of lyric that runs on and on and on"],
		];
		for (const lines of cases) {
			const result = fits(lines);
			expect(result.widthOk, `width overflow: ${lines[0]}`).toBe(true);
			expect(result.heightOk, `height overflow: ${lines[0]}`).toBe(true);
		}
	});

	it("fills the measure rather than sizing by line count", () => {
		// The regression this guards (D-020): Devanagari advances are narrower,
		// so a count-based rule left those cards at roughly half width.
		const devanagari = ["खड़ा हूँ आज भी वहीं", "कि दिल फिर बेक़रार है"];
		const { size } = cardTypeScale(devanagari);
		const used = Math.max(...devanagari.map(measureEm)) * size;
		expect(used / CONTENT_WIDTH).toBeGreaterThan(0.6);
	});

	it("respects the display ceiling for a very short selection", () => {
		expect(cardTypeScale(["Oh"]).size).toBeLessThanOrEqual(108);
	});

	it("respects the floor rather than shrinking without limit", () => {
		const enormous = ["x".repeat(400)];
		expect(cardTypeScale(enormous).size).toBeGreaterThanOrEqual(30);
	});

	it("gives more lines a smaller size", () => {
		const two = cardTypeScale(["short line", "short line"]).size;
		const six = cardTypeScale(Array(6).fill("short line")).size;
		expect(six).toBeLessThan(two);
	});
});

describe("cardThemes", () => {
	it("emits sRGB hex, never oklch", () => {
		// Satori renders oklch() as black, silently (D-018).
		for (const theme of cardThemes(null)) {
			expect(theme.background).not.toContain("oklch");
			expect(theme.ink).toMatch(/^#[0-9a-f]{6}$/i);
			expect(theme.muted).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});

	it("derives the hue from the track palette", () => {
		const a = cardThemes({ accent: "oklch(0.72 0.16 25)" } as never)[0];
		const b = cardThemes({ accent: "oklch(0.72 0.16 250)" } as never)[0];
		expect(a?.background).not.toBe(b?.background);
	});

	it("falls back to a default hue with no palette", () => {
		expect(cardThemes(null)).toHaveLength(4);
	});

	it("themeById falls back to the first theme for an unknown id", () => {
		expect(themeById(null, "nonsense").id).toBe(cardThemes(null)[0]?.id);
	});
});
