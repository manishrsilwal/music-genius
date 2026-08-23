/**
 * The font tables are hand-typed paths and hand-typed family names, and both
 * fail quietly: a wrong path throws only when someone exports a card in that
 * script, and a missing family renders tofu rather than erroring at all
 * (D-057). Neither shows up in a typecheck, so they are asserted here.
 */

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DETECTABLE_LANGS } from "../lib/script";
import {
	BASE_FONTS,
	CJK_FAMILY,
	CJK_FONTS,
	SCRIPT_FONTS,
} from "./fonts.server";

/**
 * Scripts detectLang reports but which need no companion face: Rufina already
 * covers Latin, and Greek and Cyrillic are served by one Noto Serif family
 * declared under two names — the web gets a single family with two
 * unicode-ranges, while Satori, which cannot express a range, needs each
 * binary registered separately.
 */
const COVERED_BY: Record<string, string> = {
	hi: "Vesper Libre",
	bn: "Noto Serif Bengali",
	pa: "Noto Serif Gurmukhi",
	gu: "Noto Serif Gujarati",
	ta: "Noto Serif Tamil",
	te: "Noto Serif Telugu",
	kn: "Noto Serif Kannada",
	ml: "Noto Serif Malayalam",
	ar: "Amiri",
	he: "Noto Serif Hebrew",
	th: "Noto Serif Thai",
	el: "Noto Serif Greek",
	ru: "Noto Serif",
};

describe("font files", () => {
	const all = [
		...Object.entries(BASE_FONTS),
		...Object.entries(SCRIPT_FONTS),
		...Object.entries(CJK_FONTS),
	];

	it.each(all)("%s resolves to a file on disk", (_name, file) => {
		expect(existsSync(file), `missing font binary: ${file}`).toBe(true);
	});

	it("loads .woff, never .woff2 — satori cannot parse woff2", () => {
		for (const [, file] of all) {
			expect(file.endsWith(".woff"), `${file} is not .woff`).toBe(true);
		}
	});
});

describe("script coverage", () => {
	it("gives every language detectLang can return a face", () => {
		const missing = DETECTABLE_LANGS.filter(
			(lang) => !(lang in COVERED_BY) && !(lang in CJK_FAMILY),
		);
		expect(missing, `no face registered for: ${missing.join(", ")}`).toEqual(
			[],
		);
	});

	it("registers each non-CJK face in the satori stack", () => {
		for (const [lang, family] of Object.entries(COVERED_BY)) {
			expect(SCRIPT_FONTS[family], `${lang} → ${family}`).toBeDefined();
		}
	});

	it("has a binary for every CJK family it names", () => {
		expect(Object.keys(CJK_FAMILY).sort()).toEqual(
			Object.keys(CJK_FONTS).sort(),
		);
	});
});
