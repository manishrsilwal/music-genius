import { Link } from "@tanstack/react-router";

import "./masthead.scss";

/**
 * The one persistent way home (D-059).
 *
 * Replaces `.track-home`, which was `display: none` below `sm` — so on a phone
 * a reader who opened a track had no way back to the catalogue at all, only the
 * browser's back button. It also sat on the bottom-left, sharing an edge with
 * the docked player and the Discover button; a home affordance belongs where
 * readers already look for one.
 *
 * Rendered once in the root document rather than per route, so every page —
 * landing, track, 404, error — carries the same mark in the same place. That is
 * the point: an element that moves or disappears is not a way home, it is a
 * link that sometimes exists.
 */
export function Masthead() {
	return (
		<Link
			to="/"
			className="masthead"
			aria-label="Lyrical Explorer, home"
			// Announces "current page" when the reader is already on the landing.
			// The mark stays put rather than disappearing there: an element that
			// exists on some pages and not others is chrome the reader has to
			// re-find, which is the habit this replaces.
			activeProps={{ "aria-current": "page" }}
		>
			{/*
			  Three rules of unequal length — a stanza, which is the one shape
			  this product is actually about. Drawn rather than set, so it holds
			  at 16px where a wordmark cannot, and so the mark survives on the
			  narrow screens where the old link vanished.

			  The last rule holds brass — the product's own accent — and does NOT
			  follow the track. Everything inside the article repaints per record
			  (D-052); the mark deliberately does not, because an identity that
			  changes colour on every page stops functioning as one. It is also
			  the only element outside `[data-track-scope]`, so this is what the
			  cascade does anyway; stating it here so the next person does not
			  "fix" it into the scope.
			*/}
			<svg
				className="masthead__mark"
				viewBox="0 0 16 16"
				aria-hidden="true"
				focusable="false"
			>
				<rect x="0" y="3" width="16" height="1.6" rx="0.8" />
				<rect x="0" y="7.2" width="10.5" height="1.6" rx="0.8" />
				<rect
					x="0"
					y="11.4"
					width="13.5"
					height="1.6"
					rx="0.8"
					className="masthead__accent"
				/>
			</svg>

			{/*
			  Hidden below `sm`, where the mark carries the identity on its own.
			  This is the reverse of the old behaviour: the compact half is what
			  survives, rather than the whole thing disappearing.
			*/}
			<span className="masthead__word">Lyrical Explorer</span>
		</Link>
	);
}
