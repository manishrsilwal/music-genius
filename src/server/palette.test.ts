import { describe, expect, it } from "vitest";

import { buildPalette, isAllowedArtworkUrl } from "./palette.server";

/**
 * The paper's safety property (D-052).
 *
 * Tinting the page is only safe because OKLCH lightness is perceptual: hold it
 * fixed, move hue and chroma, and no contrast ratio changes. That claim is what
 * these tests defend — every surface must come back at exactly the lightness of
 * the default it replaces, whatever the artwork.
 */

/** Pull the three channels out of the string culori formats. */
function channels(value: string) {
	const m = value.match(
		/^oklch\((\d*\.?\d+) (\d*\.?\d+) (\d*\.?\d+)(?: \/ (\d*\.?\d+))?\)$/,
	);
	if (!m) throw new Error(`not an oklch string: ${value}`);
	return {
		l: Number(m[1]),
		c: Number(m[2]),
		h: Number(m[3]),
		a: m[4] === undefined ? undefined : Number(m[4]),
	};
}

// A saturated red, a saturated blue, a pale wash, and a muted earth tone that
// clears the achromatic gate at c=0.028. Measured, not assumed: #8a8f86 looks
// like a plausible sleeve grey but sits at c=0.014 and is correctly rejected.
const COVERS = ["#d81f26", "#3391cc", "#f0c8d8", "#7a6f5f"];

describe("buildPalette — the paper", () => {
	it("holds surface lightness fixed whatever the cover", () => {
		for (const hex of COVERS) {
			const palette = buildPalette(hex);
			expect(palette, hex).not.toBeNull();
			if (!palette) continue;

			expect(channels(palette.canvas).l, hex).toBe(0.13);
			expect(channels(palette.surface).l, hex).toBe(0.175);
			expect(channels(palette.surfaceRaised).l, hex).toBe(0.225);
		}
	});

	it("keeps every surface far below accent chroma", () => {
		for (const hex of COVERS) {
			const palette = buildPalette(hex);
			if (!palette) continue;

			const accent = channels(palette.accent).c;
			for (const surface of [
				palette.canvas,
				palette.surface,
				palette.surfaceRaised,
			]) {
				// A surface carries far more area than a mark, and area
				// multiplies chroma. At accent strength the page would compete
				// with the artwork it exists to frame.
				expect(channels(surface).c).toBeLessThanOrEqual(0.026);
				expect(channels(surface).c).toBeLessThan(accent);
			}
		}
	});

	it("tints less for a muted cover rather than inventing saturation", () => {
		// Chroma is `min(cover, ceiling)`, so a wash cannot be pushed up to a
		// saturation its artwork never had.
		const pale = buildPalette("#f0c8d8");
		const vivid = buildPalette("#d81f26");
		expect(pale).not.toBeNull();
		expect(vivid).not.toBeNull();
		if (!pale || !vivid) return;

		expect(channels(pale.canvas).c).toBeLessThanOrEqual(
			channels(vivid.canvas).c,
		);
	});

	it("carries the cover's hue through paper and ink alike", () => {
		const palette = buildPalette("#3391cc");
		expect(palette).not.toBeNull();
		if (!palette) return;

		const hue = channels(palette.accent).h;
		expect(channels(palette.canvas).h).toBeCloseTo(hue, 5);
		expect(channels(palette.surface).h).toBeCloseTo(hue, 5);
		expect(channels(palette.hairline).h).toBeCloseTo(hue, 5);
	});

	it("keeps the hairline translucent, so it reads as a tint of the paper", () => {
		const palette = buildPalette("#d81f26");
		expect(palette).not.toBeNull();
		if (!palette) return;
		expect(channels(palette.hairline).a).toBe(0.16);
	});

	it("refuses an achromatic cover rather than inventing a hue", () => {
		// Hue defaults to 0 for a greyscale swatch, which would come out dull
		// red — a colour the artwork does not contain.
		expect(buildPalette("#808080")).toBeNull();
		expect(buildPalette("#ffffff")).toBeNull();
		expect(buildPalette("#000000")).toBeNull();
	});

	it("returns null for a string that is not a colour", () => {
		expect(buildPalette("not a colour")).toBeNull();
	});
});

/**
 * The artwork URL is fetched by the server and arrives from an external API,
 * which is the shape of an SSRF (D-053).
 */
describe("isAllowedArtworkUrl", () => {
	it("accepts the Genius image hosts", () => {
		expect(
			isAllowedArtworkUrl("https://images.genius.com/abc.300x300x1.png"),
		).toBe(true);
		expect(isAllowedArtworkUrl("https://assets.genius.com/x.jpg")).toBe(true);
	});

	it("refuses cloud instance metadata", () => {
		expect(
			isAllowedArtworkUrl("http://169.254.169.254/latest/meta-data/"),
		).toBe(false);
		expect(isAllowedArtworkUrl("https://169.254.169.254/")).toBe(false);
	});

	it("refuses loopback and private addresses", () => {
		expect(isAllowedArtworkUrl("http://localhost:6379/")).toBe(false);
		expect(isAllowedArtworkUrl("https://127.0.0.1/x.png")).toBe(false);
		expect(isAllowedArtworkUrl("https://10.0.0.5/x.png")).toBe(false);
	});

	it("refuses plaintext even from an allowed host", () => {
		expect(isAllowedArtworkUrl("http://images.genius.com/x.png")).toBe(false);
	});

	it("is not fooled by a lookalike host", () => {
		expect(isAllowedArtworkUrl("https://images.genius.com.evil.tld/x")).toBe(
			false,
		);
		expect(isAllowedArtworkUrl("https://evil.tld/images.genius.com/x")).toBe(
			false,
		);
		// Userinfo before an @ is the classic way to make a URL read as one host
		// while resolving to another.
		expect(isAllowedArtworkUrl("https://images.genius.com@evil.tld/x")).toBe(
			false,
		);
	});

	it("refuses other schemes outright", () => {
		expect(isAllowedArtworkUrl("file:///etc/passwd")).toBe(false);
		expect(isAllowedArtworkUrl("data:image/png;base64,AAAA")).toBe(false);
		expect(isAllowedArtworkUrl("not a url")).toBe(false);
	});
});
