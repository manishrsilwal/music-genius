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
	return (
		<motion.div
			className="dives"
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

						<WhyThis pick={pick} preferences={preferences} />
					</Link>
				</motion.div>
			))}
		</motion.div>
	);
}

/**
 * Why this song, in the reader's own terms (D-045).
 *
 * Two halves: the axes that actually scored, read straight out of the picker,
 * and the track's editorial note. When the reader skipped the stepper there
 * are no axes, so it says the pick came from the day's rotation rather than
 * claiming a reason it does not have.
 */
function WhyThis({
	pick,
	preferences,
}: {
	pick: CuratedTrack;
	preferences: Preferences;
}) {
	const { matched, note } = explainPick(pick, preferences);

	// Chips rather than a sentence. The three picks share identical reasons
	// 42% of the time, and three repetitions of "For longing, the honesty and
	// deep cuts" reads as a stutter — where repeated tags read as
	// classification, which is what they are.
	const reasons = matched.length > 0 ? matched : ["today's rotation"];

	return (
		<span className="dives__why block">
			<span className="dives__why-tags">
				{reasons.map((reason) => (
					<span key={reason} className="dives__why-tag text-micro">
						{reason}
					</span>
				))}
			</span>
			<span className="dives__why-note mt-2 block text-caption">{note}</span>
		</span>
	);
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
