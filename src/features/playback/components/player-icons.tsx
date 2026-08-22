/**
 * Play and pause marks (D-040).
 *
 * Drawn rather than typed: at 14px a glyph would fight the display face, and
 * the shapes are universal enough not to need a word. `currentColor` so they
 * inherit whatever the control is tinted with.
 */

export function PlayIcon() {
	return (
		<svg
			viewBox="0 0 16 16"
			width="15"
			height="15"
			aria-hidden="true"
			focusable="false"
			fill="currentColor"
		>
			{/* Nudged right by half a point: a triangle centred on its bounding
			    box reads as sitting left of centre inside a circle. */}
			<path d="M4.6 2.4a.7.7 0 0 1 1.06-.6l7.2 5.6a.7.7 0 0 1 0 1.2l-7.2 5.6A.7.7 0 0 1 4.6 13.6Z" />
		</svg>
	);
}

export function PauseIcon() {
	return (
		<svg
			viewBox="0 0 16 16"
			width="15"
			height="15"
			aria-hidden="true"
			focusable="false"
			fill="currentColor"
		>
			<rect x="3.6" y="2.4" width="3.2" height="11.2" rx="1.1" />
			<rect x="9.2" y="2.4" width="3.2" height="11.2" rx="1.1" />
		</svg>
	);
}
