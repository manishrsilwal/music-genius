import { useCallback, useEffect, useState } from "react";

import {
	type HistoryEntry,
	parseHistory,
	recordVisit,
	removeVisit,
} from "@/lib/history";

/**
 * Reading history, stored locally (D-056).
 *
 * Same shape and same constraints as `usePreferences`: read in an effect
 * because localStorage does not exist during SSR, and reading it in the first
 * client render would make the markup disagree with the server's.
 *
 * Nothing is sent anywhere. The product has no accounts and this does not
 * introduce one.
 */

const KEY = "tle:history";

export interface HistoryState {
	entries: HistoryEntry[];
	/** Null until storage has been read, so the shelf never flashes empty. */
	loaded: boolean;
	record: (entry: HistoryEntry) => void;
	remove: (id: string) => void;
	clear: () => void;
}

function persist(entries: HistoryEntry[]) {
	try {
		window.localStorage.setItem(KEY, JSON.stringify(entries));
	} catch {
		// Private browsing, or storage disabled. History simply does not
		// persist; every other part of the session is unaffected.
	}
}

export function useHistory(): HistoryState {
	const [entries, setEntries] = useState<HistoryEntry[]>([]);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		try {
			setEntries(parseHistory(window.localStorage.getItem(KEY)));
		} catch {
			setEntries([]);
		}
		setLoaded(true);
	}, []);

	const record = useCallback((entry: HistoryEntry) => {
		setEntries((current) => {
			const next = recordVisit(current, entry);
			// Identity is the signal that nothing changed — `recordVisit`
			// returns the same array for an entry it rejects, so this avoids a
			// pointless write and a pointless render.
			if (next !== current) persist(next);
			return next;
		});
	}, []);

	const remove = useCallback((id: string) => {
		setEntries((current) => {
			const next = removeVisit(current, id);
			persist(next);
			return next;
		});
	}, []);

	const clear = useCallback(() => {
		setEntries([]);
		try {
			window.localStorage.removeItem(KEY);
		} catch {
			/* nothing to do */
		}
	}, []);

	return { entries, loaded, record, remove, clear };
}

/**
 * Record a visit to one track. Split from the shelf so the track page can call
 * it without importing anything that renders.
 */
export function useRecordVisit(entry: HistoryEntry) {
	const { record } = useHistory();
	const { id, title, artist } = entry;

	// Depends on the fields, not the object: the track page rebuilds the entry
	// on every render, and a fresh object each time would re-fire this forever.
	useEffect(() => {
		record({ id, title, artist });
	}, [record, id, title, artist]);
}
