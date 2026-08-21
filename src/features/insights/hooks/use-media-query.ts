import { useEffect, useState } from "react";

/**
 * Tracks a media query.
 *
 * The insights drawer is not one component styled two ways — desktop compresses
 * the canvas, mobile is a draggable sheet (PRD §3.5) — so the behaviour, not
 * just the appearance, has to branch.
 *
 * Starts false so server and first client render agree; a mismatch here would
 * be a hydration error.
 */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(false);

	useEffect(() => {
		const list = window.matchMedia(query);
		setMatches(list.matches);

		const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
		list.addEventListener("change", onChange);
		return () => list.removeEventListener("change", onChange);
	}, [query]);

	return matches;
}
