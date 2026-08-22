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

	// The paper (D-052). Refused as a group: a page tinted on three of four
	// tokens is worse than one tinted on none, since the odd surface out reads
	// as a rendering fault rather than as a choice.
	const canvas = safe(palette.canvas);
	const surface = safe(palette.surface);
	const raised = safe(palette.surfaceRaised);
	const hairline = safe(palette.hairline);
	const paper = canvas && surface && raised && hairline;

	// scope is a route param, so it is constrained to the selector-safe subset.
	const id = scope.replace(/[^a-zA-Z0-9_-]/g, "");
	const selector = `[data-track-scope="${id}"]`;

	const ink = `${selector}{--track-accent:${accent};--track-accent-soft:${accentSoft};--track-glow:${glow};}`;

	/*
	 * Paper is set on <body>, not on the article.
	 *
	 * Custom properties inherit downward, and the page background is painted
	 * from body's own computed value — so tinting the article would repaint
	 * every panel inside it and leave the page behind them unchanged, which is
	 * the one combination that looks broken.
	 *
	 * `body:has(…)` scores (0,1,1) against the (0,1,0) that `@theme` emits at
	 * `:root`, so it wins on specificity rather than on source order. That
	 * matters here: this <style> mounts after first paint (D-017), and relying
	 * on order would make the outcome depend on where React happened to put it.
	 */
	const stock = paper
		? `body:has(${selector}){--color-canvas:${canvas};--color-surface:${surface};--color-surface-raised:${raised};--color-hairline:${hairline};}`
		: "";

	return (
		// Text children rather than dangerouslySetInnerHTML: React supports it
		// for <style>, and it keeps this component free of an XSS-shaped API
		// even though the values above are already regex-validated.
		<style>{ink + stock}</style>
	);
}
