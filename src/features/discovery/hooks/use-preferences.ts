import { useCallback, useEffect, useState } from "react";

import type { Preferences } from "@/lib/deep-dives";

/**
 * Reader preferences (PRD §3.1).
 *
 * Stored locally — no account, nothing sent anywhere. The stepper exists to
 * answer "a blank search bar is intimidating", not to build a profile.
 *
 * Read in an effect rather than in the initialiser: localStorage does not
 * exist during SSR, and reading it during the first client render would make
 * the markup disagree with the server's and trip a hydration error.
 */

const KEY = "tle:preferences";

export const EMPTY_PREFERENCES: Preferences = {
	mood: null,
	language: null,
	era: null,
};

export interface PreferencesState {
	preferences: Preferences;
	/** Null until we have read storage; used to avoid flashing the stepper. */
	answered: boolean | null;
	save: (next: Preferences) => void;
	reset: () => void;
}

export function usePreferences(): PreferencesState {
	const [preferences, setPreferences] =
		useState<Preferences>(EMPTY_PREFERENCES);
	const [answered, setAnswered] = useState<boolean | null>(null);

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(KEY);
			if (stored) {
				setPreferences({ ...EMPTY_PREFERENCES, ...JSON.parse(stored) });
				setAnswered(true);
			} else {
				setAnswered(false);
			}
		} catch {
			// Private browsing, or storage disabled. Treat it as a first visit;
			// the stepper is skippable, so nothing is lost.
			setAnswered(false);
		}
	}, []);

	const save = useCallback((next: Preferences) => {
		setPreferences(next);
		setAnswered(true);
		try {
			window.localStorage.setItem(KEY, JSON.stringify(next));
		} catch {
			// Preferences simply do not persist. The session still works.
		}
	}, []);

	const reset = useCallback(() => {
		setPreferences(EMPTY_PREFERENCES);
		setAnswered(false);
		try {
			window.localStorage.removeItem(KEY);
		} catch {
			/* nothing to do */
		}
	}, []);

	return { preferences, answered, save, reset };
}
