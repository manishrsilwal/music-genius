/**
 * SVG → PNG rasterisation, behind an interface (ARCHITECTURE.md D-009).
 *
 * The deployment target is deliberately undecided, and this is one of the two
 * subsystems that forks on it: @resvg/resvg-js is a native binary and will not
 * run on Cloudflare Workers, which needs @resvg/resvg-wasm instead.
 *
 * Swapping targets should be a change to this file and nothing else.
 */

import { Resvg } from "@resvg/resvg-js";

export interface Rasteriser {
	toPng(svg: string, width: number): Uint8Array;
}

/** Native rasteriser. Fast, but Node/Bun/Vercel only — not Workers. */
export const nativeRasteriser: Rasteriser = {
	toPng(svg, width) {
		return new Resvg(svg, { fitTo: { mode: "width", value: width } })
			.render()
			.asPng();
	},
};

export function getRasteriser(): Rasteriser {
	return nativeRasteriser;
}
