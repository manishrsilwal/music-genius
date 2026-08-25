import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { SectionHeading } from "@/components/section-heading";
import { ContinueReading } from "@/features/discovery/components/continue-reading";
import {
	AlsoLiked,
	DeepDives,
} from "@/features/discovery/components/deep-dives";
import { PreferenceStepper } from "@/features/discovery/components/preference-stepper";
import { SearchField } from "@/features/discovery/components/search-field";
import { TasteChips } from "@/features/discovery/components/taste-chips";
import { useHistory } from "@/features/discovery/hooks/use-history";
import { usePreferences } from "@/features/discovery/hooks/use-preferences";
import { useRotation } from "@/features/discovery/hooks/use-rotation";
import { pickAlsoLiked, pickDeepDives, seedFromDate } from "@/lib/deep-dives";
import { riseVariants, staggerVariants, transition } from "@/lib/motion";

import "./index.scss";

export const Route = createFileRoute("/")({
	// The day's seed is fixed on the server so every visitor sees the same
	// picks for a given date, and they rotate at midnight without a cron job.
	loader: () => ({ today: new Date().toISOString().slice(0, 10) }),
	component: Discovery,
});

/**
 * Discovery (PRD §3.1).
 *
 * "A blank search bar is intimidating. Users don't always know what they want
 * to search for." So a first visitor is asked three short questions instead of
 * being handed an empty field, and the answers seed the day's shelves.
 *
 * The page no longer vertically centres itself. Doing so, with a hero at the
 * full display size, pushed the first question below the fold on a laptop —
 * the reader had to scroll before they could answer (D-028).
 */
function Discovery() {
	const { today } = Route.useLoaderData();
	const { preferences, answered, save, reset } = usePreferences();
	const { entries, remove, clear } = useHistory();
	const { rotation, shuffle } = useRotation();

	/*
	 * The day, plus how many times this reader has been here (D-072).
	 *
	 * The date alone meant a reader who came back an hour later saw the same
	 * three songs, and a reader who skipped the questions saw the same three as
	 * everyone else who skipped — all day, out of a catalogue of fifty-six.
	 *
	 * The prime is arbitrary but must be large and odd: multiplied into a seed
	 * that `seededOrder` then xorshifts, a small factor moves the shuffle by
	 * too little to change which three tracks come out on top.
	 */
	const seed = seedFromDate(today) + rotation * 7919;

	// Songs already opened are pushed to the back rather than removed: with a
	// finite catalogue, a reader who has been through it should still get a
	// shelf.
	const seen = useMemo(() => entries.map((entry) => entry.id), [entries]);

	const dives = useMemo(
		() => pickDeepDives(preferences, seed, undefined, seen),
		[preferences, seed, seen],
	);
	const also = useMemo(
		() => pickAlsoLiked(preferences, seed, dives, undefined, seen),
		[preferences, seed, dives, seen],
	);

	return (
		<motion.main
			id="main"
			// Wide enough for the bento (D-088); the stepper branch narrows
			// itself back to the old reading measure.
			className="landing mx-auto w-full max-w-6xl px-6"
			variants={staggerVariants}
			initial="hidden"
			animate="visible"
		>
			{/*
			  The product name was an eyebrow here and nowhere else. The masthead
			  carries it on every page now (D-059), so repeating it directly
			  beneath itself would just be the same words twice.
			*/}
			{/*
			  Mixed on one line (D-064): a heavy geometric sans against the
			  display serif's real italic, at the same size. The reference
			  language gets its energy from that collision rather than from
			  decoration, and it costs nothing but two spans.
			*/}
			<div className="landing__head">
				<motion.h1 variants={riseVariants} className="landing__title text-ink">
					<span className="landing__title-plain">Read the words</span>{" "}
					<em className="landing__title-fancy">properly</em>
				</motion.h1>

				{/*
				  Search is page chrome now, not a card (D-090): top right, the
				  pill alone on the canvas. It renders only once the shelves do —
				  a first visitor is mid-stepper and the field would compete with
				  the questions.
				*/}
				{answered === true && (
					<motion.div variants={riseVariants} className="landing__find">
						<SearchField />
					</motion.div>
				)}
			</div>

			<AnimatePresence mode="wait">
				{/* `answered` is null until localStorage has been read. Reserving
				    the space avoids both a layout jump and flashing the stepper at
				    a returning reader who already answered. */}
				{answered === null ? (
					<div key="waiting" className="mt-8 h-64" />
				) : answered === false ? (
					<motion.div
						key="stepper"
						className="mt-8 max-w-2xl"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0, y: -12 }}
						transition={transition.editorial}
					>
						<PreferenceStepper onComplete={save} />
					</motion.div>
				) : (
					<motion.div
						key="discovery"
						className="bento mt-10"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={transition.editorial}
					>
						{/*
						  One results region (D-090). The three cards and the
						  also-liked list are both outputs of the same answers, so
						  they share one surface — cards left, list beside — with
						  the mood chips on top as the region's FILTER, not a
						  sibling tile: change a chip and everything under it
						  re-ranks. Search left the grid for the page's head, and
						  the resume strip follows the results rather than
						  interrupting them.
						*/}
						<section className="bento__tile bento__results">
							<div className="bento__filter">
								<div className="bento__filter-bar">
									<div>
										<h2 className="mb-1 text-micro font-semibold uppercase tracking-label text-ink">
											Tuned to your answers
										</h2>
										<p className="mb-3 text-caption text-ink-faint">
											Change any answer without starting over.
										</p>
									</div>

									{/*
									  At the region's head, not inside Deep Dives
									  (D-091). "Show three more" sat in one shelf's
									  heading while quietly re-picking BOTH shelves —
									  the also-liked list changed with no signal that
									  it would. The control now sits level with the
									  filter it complements and its label states its
									  scope.
									*/}
									<button
										type="button"
										onClick={shuffle}
										className="bento__shuffle px-4 py-2 text-micro"
									>
										<svg
											viewBox="0 0 14 14"
											width="13"
											height="13"
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
										Shuffle all picks
									</button>
								</div>

								<TasteChips
									preferences={preferences}
									onChange={save}
									onStartOver={reset}
								/>
							</div>

							{/*
							  Keyed on the rotation, so a shuffle re-enters BOTH
							  shelves together (D-091): the interaction's whole
							  scope is visible as one gesture instead of two lists
							  silently swapping their contents.
							*/}
							<motion.div
								key={rotation}
								className="bento__shelves"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={transition.editorial}
							>
								<div className="bento__dives">
									{/*
									  The lead says what the shelf is, which the label
									  alone did not. Three picks out of a hand-built
									  catalogue is an editorial claim; unlabelled it
									  reads as the whole of a thin library (D-056).
									*/}
									<SectionHeading lead="Three from a catalogue we chose by hand, matched to your answers. They change every time you come back.">
										Deep Dives
									</SectionHeading>

									<DeepDives picks={dives} preferences={preferences} />
								</div>

								{/*
								  Below the cards, not beside them (D-091): a side
								  column always outran the three cards and left a
								  dead zone under them. Full width, the list runs
								  three columns and the region closes flush.
								*/}
								<aside className="bento__also">
									<SectionHeading lead="More from the same catalogue, ranked further down your answers.">
										People also like
									</SectionHeading>
									<AlsoLiked picks={also} />
								</aside>
							</motion.div>
						</section>

						{/*
						  Gated on entries because ContinueReading returns null for
						  an empty history — and an empty tile would render as a
						  blank card, which reads as something failing to load.
						*/}
						{entries.length > 0 && (
							<section className="bento__tile bento__resume">
								<ContinueReading
									entries={entries}
									onRemove={remove}
									onClear={clear}
								/>
							</section>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</motion.main>
	);
}
