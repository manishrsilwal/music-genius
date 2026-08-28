import { useCallback, useEffect, useState } from "react";

import type { Taste } from "@/lib/deep-dives";

/**
 * The reader's direct verdicts on recommendations (D-121).
 *
 * Stored locally, like preferences — no account, nothing sent anywhere.
 * "Not for me" hides a track from every recommendation shelf permanently
 * (search still reaches it); "More like this" lends the liked track's
 * attributes a small pull on similar songs. Both are cheap words for the
 * reader and the only true personalisation signal the shelves get: the
 * stepper says who the reader is, this says what they actually thought.
 *
 * Read in an effect rather than in the initialiser: localStorage does not
 * exist during SSR, and reading it during the first client render would
 * make the markup disagree with the server's and trip a hydration error.
 */

const KEY = "tle:taste";

interface StoredTaste {
	hidden: string[];
	liked: string[];
}

const EMPTY: StoredTaste = { hidden: [], liked: [] };

function readStored(): StoredTaste {
	try {
		const raw = window.localStorage.getItem(KEY);
		if (!raw) return EMPTY;
		const parsed = JSON.parse(raw) as Partial<StoredTaste>;
		const ids = (value: unknown): string[] =>
			Array.isArray(value)
				? [
						...new Set(
							value.filter((id): id is string => typeof id === "string"),
						),
					]
				: [];
		return { hidden: ids(parsed.hidden), liked: ids(parsed.liked) };
	} catch {
		return EMPTY;
	}
}

function write(next: StoredTaste) {
	try {
		window.localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		// Verdicts simply do not persist. The session still works.
	}
}

export interface TasteState {
	taste: Taste;
	/** How many tracks the reader has hidden, for the bring-back line. */
	hiddenCount: number;
	isLiked: (lrclibId: string) => boolean;
	hide: (lrclibId: string) => void;
	toggleLike: (lrclibId: string) => void;
	/** The undo the hide contract promises: every hidden track returns. */
	restoreHidden: () => void;
}

export function useTaste(): TasteState {
	const [stored, setStored] = useState<StoredTaste>(EMPTY);

	useEffect(() => {
		setStored(readStored());
	}, []);

	const hide = useCallback((lrclibId: string) => {
		setStored((current) => {
			const next: StoredTaste = {
				// Hiding wins over a previous like: "not for me" is the reader's
				// latest word, and a hidden-but-boosting track would be haunted.
				liked: current.liked.filter((id) => id !== lrclibId),
				hidden: current.hidden.includes(lrclibId)
					? current.hidden
					: [...current.hidden, lrclibId],
			};
			write(next);
			return next;
		});
	}, []);

	const toggleLike = useCallback((lrclibId: string) => {
		setStored((current) => {
			const next: StoredTaste = {
				hidden: current.hidden,
				liked: current.liked.includes(lrclibId)
					? current.liked.filter((id) => id !== lrclibId)
					: [...current.liked, lrclibId],
			};
			write(next);
			return next;
		});
	}, []);

	const restoreHidden = useCallback(() => {
		setStored((current) => {
			const next: StoredTaste = { hidden: [], liked: current.liked };
			write(next);
			return next;
		});
	}, []);

	const isLiked = useCallback(
		(lrclibId: string) => stored.liked.includes(lrclibId),
		[stored.liked],
	);

	return {
		taste: stored,
		hiddenCount: stored.hidden.length,
		isLiked,
		hide,
		toggleLike,
		restoreHidden,
	};
}
