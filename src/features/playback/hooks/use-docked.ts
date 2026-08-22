import { useEffect, useState } from "react";

/**
 * True once the player's place in the hero has scrolled off the top of the
 * viewport (D-038).
 *
 * IntersectionObserver rather than a scroll listener, matching `useScrollSpy`:
 * the browser does the work off the main thread.
 *
 * The sentinel is a separate zero-height element, never the player itself. A
 * player that becomes `position: fixed` when it leaves the viewport is
 * immediately back in the viewport, which un-docks it, which takes it out of
 * the viewport again — a flip-flop at the scroll position where it switches.
 * The sentinel stays in flow and is unaffected by what the player does.
 */
export function useDocked(sentinel: React.RefObject<HTMLElement | null>) {
	const [docked, setDocked] = useState(false);

	useEffect(() => {
		const element = sentinel.current;
		if (!element) return;

		// No observer support, or a server-rendered pass: leave the player in
		// the hero rather than docking something that never un-docks.
		if (typeof IntersectionObserver === "undefined") return;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry) return;
				// Only dock when the sentinel has left upward. Leaving downward
				// happens on a short viewport before the reader has scrolled at
				// all, and docking then would hide the hero placement entirely.
				setDocked(!entry.isIntersecting && entry.boundingClientRect.top < 0);
			},
			{ threshold: 0 },
		);

		observer.observe(element);
		return () => observer.disconnect();
	}, [sentinel]);

	return docked;
}
