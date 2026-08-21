import type { CSSProperties } from "react";

import type { Palette } from "./types";

/**
 * Turn an extracted palette into inline custom properties.
 *
 * This is the whole point of the `@theme inline` indirection set up in D-003:
 * assigning these three variables repaints every accent utility on the page at
 * once, with no React re-render and no per-component colour plumbing.
 *
 * Returns an empty object when there is no palette, so the defaults declared
 * in styles.css simply stand.
 */
export function paletteStyle(palette: Palette | null): CSSProperties {
	if (!palette) return {};

	return {
		"--track-accent": palette.accent,
		"--track-accent-soft": palette.accentSoft,
		"--track-glow": palette.glow,
	} as CSSProperties;
}
