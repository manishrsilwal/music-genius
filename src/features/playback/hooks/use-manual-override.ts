import { useCallback, useEffect, useState } from "react";

/**
 * Detects the reader taking the wheel back (PRD §3.2: "the user can toggle
 * manual scrolling at any time").
 *
 * Listens for wheel, touchmove and the scrolling keys rather than the scroll
 * event, because programmatic scrolling fires `scroll` too — we would keep
 * cancelling ourselves. These three are unambiguously the reader.
 */

const KEYS = new Set([
	"ArrowUp",
	"ArrowDown",
	"PageUp",
	"PageDown",
	"Home",
	"End",
	" ",
]);

export function useManualOverride(active: boolean): {
	manual: boolean;
	resume: () => void;
} {
	const [manual, setManual] = useState(false);

	const resume = useCallback(() => setManual(false), []);

	useEffect(() => {
		if (!active) return;

		const take = () => setManual(true);
		const onKey = (event: KeyboardEvent) => {
			if (KEYS.has(event.key)) setManual(true);
		};

		window.addEventListener("wheel", take, { passive: true });
		window.addEventListener("touchmove", take, { passive: true });
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("wheel", take);
			window.removeEventListener("touchmove", take);
			window.removeEventListener("keydown", onKey);
		};
	}, [active]);

	return { manual, resume };
}
