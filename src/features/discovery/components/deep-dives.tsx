import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";

import {
	type CuratedTrack,
	explainPick,
	type Preferences,
} from "@/lib/deep-dives";
import { riseVariants, staggerVariants } from "@/lib/motion";
import type { TrackVisuals } from "@/lib/types";

import "./deep-dives.scss";

/**
 * Today's Deep Dives (PRD §3.1).
 *
 * Answers "a blank search bar is intimidating" with somewhere to start. Picks
 * come from the reader's stated preferences, or from the day's rotation when
 * they skipped the stepper.
 */
export function DeepDives({
	picks,
	preferences,
}: {
	picks: CuratedTrack[];
	preferences: Preferences;
}) {
	/*
	 * The reasons the picks have in common, said once above the row (D-069).
	 *
	 * The cards themselves carry no reasoning at all now: no tags and no note.
	 * A card is artwork, a title and an artist — the three things a reader
	 * needs to decide whether to open it — and everything about *why* lives on
	 * the page they open, which is where they went to find out.
	 *
	 * This line survives because it is one sentence for the whole shelf rather
	 * than a repeated label on each card, and because without it "Today's Deep
	 * Dives" is an unexplained assertion that three songs were chosen for you.
	 */
	const lists = picks.map((pick) => {
		const { matched } = explainPick(pick, preferences);
		return matched.length > 0 ? matched : ["today's rotation"];
	});
	const shared = (lists[0] ?? []).filter((reason) =>
		lists.every((list) => list.includes(reason)),
	);

	return (
		<>
			{shared.length > 0 && (
				<p className="dives__shared text-caption text-ink-muted">
					All three match{" "}
					<span className="dives__shared-value">{joinReasons(shared)}</span>.
				</p>
			)}

			<motion.div
				className="dives"
				variants={staggerVariants}
				initial="hidden"
				animate="visible"
			>
				{picks.map((pick) => (
					<motion.div
						className="dives__slot"
						key={`${pick.artist}-${pick.title}`}
						variants={riseVariants}
					>
						<Link
							to="/track/$trackId"
							params={{ trackId: pick.lrclibId }}
							className="dives__card"
						>
							{/*
							  The art and the name are one row on a phone and a
							  column from `sm`. The reason sits OUTSIDE that row so
							  it spans the whole card at every width — nested inside
							  it, a phone squeezed it into the column beside the
							  artwork (D-046).
							*/}
							<span className="dives__head">
								<DiveArt title={pick.title} artist={pick.artist} />
								<span className="min-w-0">
									<span className="dives__title text-lead text-ink">
										{pick.title}
									</span>
									<span className="dives__artist mt-0.5 block text-caption">
										{pick.artist}
									</span>
								</span>
							</span>
						</Link>
					</motion.div>
				))}
			</motion.div>
		</>
	);
}

/** "a and b", "a, b and c" — a list a person would say out loud. */
function joinReasons(reasons: string[]): string {
	if (reasons.length <= 1) return reasons[0] ?? "";
	return `${reasons.slice(0, -1).join(", ")} and ${reasons.at(-1)}`;
}

/** Same per-row artwork fetch as the autocomplete, deduped by TanStack Query. */
function DiveArt({ title, artist }: { title: string; artist: string }) {
	const { data } = useQuery({
		queryKey: ["artwork", artist.toLowerCase(), title.toLowerCase()],
		queryFn: async ({ signal }): Promise<TrackVisuals> => {
			const query = `title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
			const response = await fetch(`/api/artwork?${query}`, { signal });
			if (!response.ok) return { artwork: null, palette: null };
			return response.json();
		},
		staleTime: Number.POSITIVE_INFINITY,
	});

	return (
		<span className="dives__art">
			{data?.artwork && (
				<img
					src={data.artwork.thumbnail}
					alt=""
					loading="lazy"
					decoding="async"
				/>
			)}
		</span>
	);
}

/**
 * "People also like" (PRD §3.1, extended).
 *
 * A longer shelf so discovery is not capped at three. Deliberately denser and
 * quieter than the Deep Dives cards: this is a list to browse past, not three
 * things to weigh.
 */
export function AlsoLiked({ picks }: { picks: CuratedTrack[] }) {
	return (
		<motion.div
			className="also"
			variants={staggerVariants}
			initial="hidden"
			animate="visible"
		>
			{picks.map((pick) => (
				<motion.div
					key={`${pick.artist}-${pick.title}`}
					variants={riseVariants}
				>
					<Link
						to="/track/$trackId"
						params={{ trackId: pick.lrclibId }}
						className="also__row"
					>
						<span className="also__title text-caption">{pick.title}</span>
						<span className="also__artist text-micro">{pick.artist}</span>
					</Link>
				</motion.div>
			))}
		</motion.div>
	);
}
