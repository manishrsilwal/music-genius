import type { Palette } from "@/lib/types";

/**
 * Applies an extracted palette by emitting a scoped style rule.
 *
 * A style rule rather than a `style` prop on the article, because the palette
 * arrives *after* first paint (D-017) and re-rendering the article to add an
 * inline style would remount the lyric canvas and lose the reader's scroll
 * position. This mounts alongside, changing nothing already on screen.
 */

/** Exactly the shape culori's formatCss produces for oklch. Anything else is refused. */
const OKLCH = /^oklch\(\d*\.?\d+ \d*\.?\d+ \d*\.?\d+( \/ \d*\.?\d+)?\)$/;

function safe(value: string): string | null {
	return OKLCH.test(value) ? value : null;
}

export function PaletteStyle({
	palette,
	scope,
}: {
	palette: Palette | null;
	scope: string;
}) {
	if (!palette) return null;

	const accent = safe(palette.accent);
	const accentSoft = safe(palette.accentSoft);
	const glow = safe(palette.glow);
	if (!accent || !accentSoft || !glow) return null;

	// scope is a route param, so it is constrained to the selector-safe subset.
	const selector = `[data-track-scope="${scope.replace(/[^a-zA-Z0-9_-]/g, "")}"]`;

	return (
		// Text children rather than dangerouslySetInnerHTML: React supports it
		// for <style>, and it keeps this component free of an XSS-shaped API
		// even though the values above are already regex-validated.
		<style>{`${selector}{--track-accent:${accent};--track-accent-soft:${accentSoft};--track-glow:${glow};}`}</style>
	);
}
