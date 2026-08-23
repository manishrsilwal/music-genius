import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/**
 * Move focus to the main region after a route change (D-062).
 *
 * In a multi-page site the browser does this: a new document resets focus to
 * the top and a screen reader announces the new page. A client-side router
 * does neither. The link the reader activated unmounts, focus falls back to
 * `<body>`, and nothing is announced — so a screen reader user who opens a
 * track hears silence, and a keyboard user's next Tab starts from the top of
 * the document rather than from where they just arrived.
 *
 * `#main` is already on every route: it is the skip link's target (D-053), so
 * this reuses the landmark rather than inventing one.
 *
 * Deliberately skips the first render. On initial load the browser has already
 * put focus in the right place, and stealing it would fight the skip link — the
 * first thing a keyboard reader tabs to.
 */
export function RouteFocus() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	// The previous path, not a boolean "have we mounted". Comparing the two
	// makes `pathname` a value the effect actually reads rather than a trigger
	// it merely lists, and it also declines to move focus when a re-render
	// reports the same route — a search that updates its own query string
	// should not throw the reader back to the top of the page.
	const previous = useRef<string | null>(null);

	useEffect(() => {
		const from = previous.current;
		previous.current = pathname;

		// `null` is the first render: the browser has focus where it belongs.
		if (from === null || from === pathname) return;

		const main = document.getElementById("main");
		if (!main) return;

		// A landmark is not focusable by default, and it must not become a tab
		// stop — -1 makes it focusable programmatically only.
		main.setAttribute("tabindex", "-1");

		// `preventScroll`, because the router already restores scroll position
		// (scrollRestoration). Without it, focusing the top of the region would
		// yank a returning reader back to the top of a page they had scrolled.
		main.focus({ preventScroll: true });
	}, [pathname]);

	return null;
}
