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
/**
 * The reader's verdict controls on a recommendation (D-121). Optional as a
 * set: a caller without taste storage renders plain cards.
 */
export interface Verdicts {
	isLiked: (lrclibId: string) => boolean;
	onLike: (lrclibId: string) => void;
	onHide: (lrclibId: string) => void;
}

export function DeepDives({
	picks,
	preferences,
	onShuffle,
	verdicts,
}: {
	picks: CuratedTrack[];
	preferences: Preferences;
	/**
	 * When provided, the shelf ends on a ghost card that re-picks EVERYTHING
	 * under the filter (D-097) — the shuffle lives inside the thing it
	 * shuffles, and its label owns the full scope the old corner button
	 * misstated.
	 */
	onShuffle?: () => void;
	verdicts?: Verdicts;
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

						{/*
						  The verdict row (D-121), OUTSIDE the link — a button
						  inside an anchor is invalid HTML and a fight over every
						  tap. Quiet on purpose: these are margin notes on the
						  card, not part of the card's pitch.
						*/}
						{verdicts && (
							<span className="dives__verdicts">
								<button
									type="button"
									className="dives__verdict"
									aria-pressed={verdicts.isLiked(pick.lrclibId)}
									data-active={verdicts.isLiked(pick.lrclibId) || undefined}
									onClick={() => verdicts.onLike(pick.lrclibId)}
								>
									{verdicts.isLiked(pick.lrclibId)
										? "More like this ✓"
										: "More like this"}
								</button>
								<button
									type="button"
									className="dives__verdict"
									onClick={() => verdicts.onHide(pick.lrclibId)}
								>
									Not for me
								</button>
							</span>
						)}
					</motion.div>
				))}

				{onShuffle && (
					<motion.div className="dives__slot" variants={riseVariants}>
						<button type="button" onClick={onShuffle} className="dives__more">
							<svg
								viewBox="0 0 14 14"
								width="16"
								height="16"
								aria-hidden="true"
								focusable="false"
							>
								<path
									d="M1.5 5.5 A5 5 0 0 1 11 3.5 M12.5 8.5 A5 5 0 0 1 3 10.5"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
								/>
								<path d="M11.5 0.8 L11.3 4 L8.2 3.4 Z" fill="currentColor" />
								<path d="M2.5 13.2 L2.7 10 L5.8 10.6 Z" fill="currentColor" />
							</svg>
							Show me different picks
						</button>
					</motion.div>
				)}
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
export function DiveArt({ title, artist }: { title: string; artist: string }) {
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
export function AlsoLiked({
	picks,
	art = false,
	onHide,
	rail = false,
}: {
	picks: CuratedTrack[];
	/**
	 * Whether rows carry a small album art (D-101). A prop rather than a
	 * default so a future caller without the covers' fetch budget can opt
	 * out; the landing passes it always now that the shelf opens expanded.
	 */
	art?: boolean;
	/** "Not for me" on a row (D-121). Optional: no taste storage, no control. */
	onHide?: (lrclibId: string) => void;
	/**
	 * Single-column rail (D-124): the first visit's "while you decide"
	 * column runs these rows one-up beside the chat, where the two-up
	 * grid would crush them.
	 */
	rail?: boolean;
}) {
	return (
		<motion.div
			className="also"
			data-rail={rail || undefined}
			variants={staggerVariants}
			initial="hidden"
			animate="visible"
		>
			{picks.map((pick) => (
				<motion.div
					key={`${pick.artist}-${pick.title}`}
					variants={riseVariants}
					className="also__item"
				>
					<Link
						to="/track/$trackId"
						params={{ trackId: pick.lrclibId }}
						className="also__row"
					>
						{/* The cover anchors the row — each entry starts on an
						    image, which is what divides it from its neighbours
						    without a rule (the owner's read). */}
						{art && (
							<span className="also__art">
								<DiveArt title={pick.title} artist={pick.artist} />
							</span>
						)}
						<span className="also__title text-caption">{pick.title}</span>
						<span className="also__artist text-micro">{pick.artist}</span>
					</Link>
					{/* Beside the link, never inside it — same reasoning as the
					    card's verdict row. */}
					{onHide && (
						<button
							type="button"
							className="also__hide"
							aria-label={`Not for me: ${pick.title}`}
							title="Not for me"
							onClick={() => onHide(pick.lrclibId)}
						>
							×
						</button>
					)}
				</motion.div>
			))}
		</motion.div>
	);
}
