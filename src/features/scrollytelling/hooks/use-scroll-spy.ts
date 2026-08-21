import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks which stanza sits in the centre of the viewport (PRD §3.3).
 *
 * IntersectionObserver rather than a scroll listener: the browser does the work
 * off the main thread, so the fades stay smooth while the reader scrolls.
 *
 * `rootMargin` collapses the viewport to a narrow band across its middle, so
 * "intersecting" means "in the centre" rather than "on screen at all". When
 * several stanzas straddle the band, the one nearest the true centre wins.
 */

/** Percentage cropped from the top and bottom, leaving a 10% band. */
const BAND_INSET = 45;

export interface ScrollSpy {
	activeIndex: number;
	register: (index: number) => (element: HTMLElement | null) => void;
	/** Shared with auto-scroll (PRD §3.2), which needs the same elements. */
	elements: React.RefObject<Map<number, HTMLElement>>;
}

export function useScrollSpy(count: number): ScrollSpy {
	const [activeIndex, setActiveIndex] = useState(0);
	const elements = useRef<Map<number, HTMLElement>>(new Map());

	const register = useCallback(
		(index: number) => (element: HTMLElement | null) => {
			if (element) elements.current.set(index, element);
			else elements.current.delete(index);
		},
		[],
	);

	useEffect(() => {
		if (count === 0 || typeof IntersectionObserver === "undefined") return;

		const observer = new IntersectionObserver(
			() => {
				const viewportCentre = window.innerHeight / 2;
				let nearest = -1;
				let smallestDistance = Number.POSITIVE_INFINITY;

				for (const [index, element] of elements.current) {
					const box = element.getBoundingClientRect();
					const distance = Math.abs(box.top + box.height / 2 - viewportCentre);
					if (distance < smallestDistance) {
						smallestDistance = distance;
						nearest = index;
					}
				}

				// Between stanzas nothing is centred; hold the last choice rather
				// than dropping every stanza to idle, which reads as a flicker.
				if (nearest !== -1) setActiveIndex(nearest);
			},
			{ rootMargin: `-${BAND_INSET}% 0px -${BAND_INSET}% 0px`, threshold: 0 },
		);

		for (const element of elements.current.values()) observer.observe(element);
		return () => observer.disconnect();
	}, [count]);

	return { activeIndex, register, elements };
}
