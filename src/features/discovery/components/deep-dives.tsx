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
	 * Split the reasons into what the picks SHARE and what tells them apart
	 * (D-068).
	 *
	 * Every card used to carry its full list, and the picker is good at its
	 * job — so all three routinely came back stamped "something tender", which
	 * is the reader's own answer read back to them three times. A label on
	 * every card carries no information about any of them; what the reader
	 * needs is the part that differs. The shared half is stated once, above
	 * the row, where it is true of the shelf rather than of a song.
	 */
	const explained = picks.map((pick) => explainPick(pick, preferences));
	const lists = explained.map(({ matched }) =>
		matched.length > 0 ? matched : ["today's rotation"],
	);
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
				{picks.map((pick, index) => (
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

							<WhyThis
								note={pick.note}
								reasons={(lists[index] ?? []).filter(
									(reason) => !shared.includes(reason),
								)}
							/>
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

/**
 * Why this song, in the reader's own terms (D-045).
 *
 * Two halves: the axes that actually scored, read straight out of the picker,
 * and the track's editorial note. When the reader skipped the stepper there
 * are no axes, so it says the pick came from the day's rotation rather than
 * claiming a reason it does not have.
 */
function WhyThis({ note, reasons }: { note: string; reasons: string[] }) {
	// Only what sets this pick apart from the other two — the reasons all
	// three share are stated once, above the row (D-068). Often that leaves
	// nothing, and nothing is the right answer: the note below is then the
	// whole of what distinguishes this song, and it gets the card to itself.
	return (
		<span className="dives__why block">
			{reasons.length > 0 && (
				<span className="dives__why-tags">
					{reasons.map((reason) => (
						<span key={reason} className="dives__why-tag text-micro">
							{reason}
						</span>
					))}
				</span>
			)}
			<span className="dives__why-note block text-caption">{note}</span>
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
