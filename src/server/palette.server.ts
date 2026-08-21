/**
 * Album-art palette extraction (PRD §3.2, ARCHITECTURE.md D-016).
 *
 * Runs server-side and is cached with the track for 30 days, so the very first
 * paint is already themed — no flash of the default accent during the hero
 * animation. It is also the only place this can live: Satori-rendered Lyric
 * Cards and OG images have no browser to extract in.
 *
 * Pure JS end to end (no native binaries), so it stays runtime-agnostic.
 */

import { converter, formatCss } from "culori";
import { Vibrant } from "node-vibrant/node";

import type { Palette } from "../lib/types";

const toOklch = converter("oklch");

/* -------------------------------------------------------------------------
   Readability normalisation

   A raw swatch cannot be trusted as an accent. Album art routinely yields
   near-black or near-grey swatches that would be invisible on our
   oklch(0.13) canvas, or neon ones that vibrate against it.

   So we keep the artwork's HUE — which is what actually reads as "this
   track's colour" — and clamp lightness and chroma into a band we know is
   legible. Tune these six numbers to change the entire product's colour feel.
   ---------------------------------------------------------------------- */

const ACCENT_LIGHTNESS = 0.72;
const SOFT_LIGHTNESS = 0.62;
const GLOW_LIGHTNESS = 0.78;

/** Below this an accent reads as grey; above it, as neon. */
const MIN_CHROMA = 0.09;
const MAX_CHROMA = 0.19;

/**
 * A swatch below this chroma carries no usable hue. Flooring it would invent a
 * colour the artwork does not contain — a greyscale cover would come out dull
 * red, because hue defaults to 0. Such swatches are skipped, and a wholly
 * achromatic cover falls back to the default accent instead.
 */
const ACHROMATIC_CHROMA = 0.02;

/** Selection-highlight alpha (PRD §3.4 uses this for the Lyric Card entry point). */
const GLOW_ALPHA = 0.35;

const clamp = (value: number, min: number, max: number) =>
	Math.min(Math.max(value, min), max);

/** Vibrant first: it is the swatch most likely to read as the record's colour. */
const PREFERENCE = [
	"Vibrant",
	"LightVibrant",
	"Muted",
	"DarkVibrant",
	"LightMuted",
	"DarkMuted",
] as const;

function buildPalette(hex: string): Palette | null {
	const parsed = toOklch(hex);
	if (!parsed) return null;
	if ((parsed.c ?? 0) < ACHROMATIC_CHROMA) return null;

	const hue = parsed.h ?? 0;
	const chroma = clamp(parsed.c ?? 0, MIN_CHROMA, MAX_CHROMA);

	const at = (lightness: number, alpha?: number) =>
		formatCss({ mode: "oklch", l: lightness, c: chroma, h: hue, alpha });

	return {
		accent: at(ACCENT_LIGHTNESS),
		accentSoft: at(SOFT_LIGHTNESS),
		glow: at(GLOW_LIGHTNESS, GLOW_ALPHA),
		sourceHex: hex,
	};
}

/**
 * Extract a palette from an image URL. Returns null on any failure — a missing
 * palette simply falls back to the default accent, so this can never take the
 * page down.
 */
export async function extractPalette(
	imageUrl: string,
): Promise<Palette | null> {
	try {
		const response = await fetch(imageUrl, {
			// The thumbnail is ~300px; enough for colour, cheap to decode.
			headers: { Accept: "image/*" },
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) return null;

		const buffer = Buffer.from(await response.arrayBuffer());
		const swatches = await Vibrant.from(buffer).getPalette();

		// Walk the preference order and take the first swatch that yields a
		// usable palette; achromatic swatches are rejected by buildPalette.
		for (const name of PREFERENCE) {
			const swatch = swatches[name];
			if (!swatch?.hex) continue;
			const palette = buildPalette(swatch.hex);
			if (palette) return palette;
		}

		return null;
	} catch (error) {
		console.warn("[palette] extraction failed", error);
		return null;
	}
}
