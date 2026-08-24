import { useCallback, useEffect, useState } from "react";

const KEY = "tle:rotation";

/**
 * How many times this reader has been shown the shelves (D-072).
 *
 * The day's picks used to come from the date alone, so a reader who came back
 * an hour later saw the same three songs — and a reader who skipped the
 * questions entirely saw the same three as everyone else who skipped, all day.
 * The catalogue has fifty-six tracks in it and was showing three.
 *
 * Counting visits and folding that into the seed makes returning worth
 * something. Stored rather than random so a single visit stays stable across
 * re-renders: the shelves must not reshuffle under a reader who merely
 * answered a question or resized the window.
 *
 * Read in an effect, not in the initialiser: localStorage does not exist during
 * SSR. That costs one extra render, which is invisible here because the
 * shelves are already waiting on `usePreferences` to read storage too.
 */
export function useRotation() {
	const [rotation, setRotation] = useState(0);

	useEffect(() => {
		try {
			const next = (Number(window.localStorage.getItem(KEY)) || 0) + 1;
			window.localStorage.setItem(KEY, String(next));
			setRotation(next);
		} catch {
			// Private mode, or storage disabled. Rotation stays at zero and the
			// reader gets the day's picks, which is the behaviour this replaced —
			// a worse experience, not a broken one.
		}
	}, []);

	/** Deal another hand now, without waiting for the next visit. */
	const shuffle = useCallback(() => {
		setRotation((current) => {
			const next = current + 1;
			try {
				window.localStorage.setItem(KEY, String(next));
			} catch {
				// The shelf still changes; only the memory of it is lost.
			}
			return next;
		});
	}, []);

	return { rotation, shuffle };
}
