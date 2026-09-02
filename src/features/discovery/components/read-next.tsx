import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { pickDeepDives } from "@/lib/deep-dives";
import { useHistory } from "../hooks/use-history";
import { usePreferences } from "../hooks/use-preferences";

import "./read-next.scss";

/**
 * Where to go when the song ends (D-076).
 *
 * The player reference calls this "Up next", and in a player it is a queue:
 * the product decides, and the next thing simply plays. This is a reader, so
 * it is an offer instead — two songs, chosen by the same scoring as the
 * landing shelves, taken when the reader is at the natural stopping point.
 *
 * Everything already read is excluded via the same history the landing uses,
 * and the current track with it — recommending the page someone is on, or one
 * they just left, is the one suggestion that cannot help them explore.
 *
 * Deliberately NOT a queue: nothing advances on its own, nothing is numbered,
 * and closing the tab loses nothing. A queue is a promise to keep playing;
 * this is a door held open.
 */
export function ReadNext({
	currentId,
	trackTo = "/track/$trackId",
}: {
	currentId: string;
	/** Which track route the doors open — v2 passes its own (D-126). */
	trackTo?: "/track/$trackId" | "/v2/track/$trackId";
}) {
	const { preferences } = usePreferences();
	const { entries } = useHistory();

	const picks = useMemo(() => {
		const seen = [currentId, ...entries.map((entry) => entry.id)];
		// The current track's id seeds the rotation, so different songs offer
		// different doors — a reader circling through their favourites is not
		// shown the same two exits on every page.
		const seed = [...currentId].reduce(
			(hash, char) => (hash * 31 + char.charCodeAt(0)) | 0,
			0,
		);
		return pickDeepDives(preferences, seed, 2, seen);
	}, [preferences, entries, currentId]);

	if (picks.length === 0) return null;

	return (
		<section className="read-next">
			<h2 className="read-next__label">Read next</h2>
			<ul className="read-next__list">
				{picks.map((pick) => (
					<li key={pick.lrclibId}>
						<Link
							to={trackTo}
							params={{ trackId: pick.lrclibId }}
							className="read-next__card"
						>
							<span className="read-next__title">{pick.title}</span>
							<span className="read-next__artist">{pick.artist}</span>
							<span className="read-next__note">{pick.note}</span>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
