import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
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

	/*
	 * "Skip all — just let me search" taken at its word (D-093). The skip
	 * stores answered=true with every axis null, and the page used to respond
	 * with shelves "tuned to your answers" the reader never gave — the one
	 * thing they had just declined. All-null is its own state now: the page
	 * is the search. A reader who answered SOME questions keeps the shelves;
	 * partial answers are still answers.
	 */
	const unpersonalised =
		answered === true &&
		!preferences.mood &&
		!preferences.pull &&
		!preferences.familiarity;
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

	/*
	 * The second shelf is an accordion with its own pagination (D-101).
	 * Collapsed by default — it is the secondary shelf, and the owner has
	 * been stripping this page's weight all day. The count survives both the
	 * toggle and a shuffle: it is the reader's chosen depth, not the shelf's.
	 */
	const [alsoOpen, setAlsoOpen] = useState(false);
	// Latches on first open: the collapse is CSS, so rows stay mounted, and
	// the covers should neither fetch for a shelf nobody expanded nor pop
	// out mid-close-animation (D-101).
	const [alsoEverOpen, setAlsoEverOpen] = useState(false);
	const [alsoCount, setAlsoCount] = useState(12);

	const dives = useMemo(
		() => pickDeepDives(preferences, seed, undefined, seen),
		[preferences, seed, seen],
	);
	const also = useMemo(
		() => pickAlsoLiked(preferences, seed, dives, alsoCount, seen),
		[preferences, seed, dives, alsoCount, seen],
	);
	// The pool is finite: fewer back than asked for means it is dry.
	const alsoExhausted = also.length < alsoCount;

	return (
		<motion.main
			id="main"
			// Wide enough for the bento (D-088); the stepper branch narrows
			// itself back to the old reading measure.
			className="landing mx-auto w-full max-w-landing px-6"
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
				{answered === true && !unpersonalised && (
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
				) : unpersonalised ? (
					<motion.div
						key="explore"
						className="explore mt-10"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={transition.editorial}
					>
						<SearchField />

						{/*
						  The one way back to personalisation. Quiet, because the
						  page is otherwise empty and nothing competes with it —
						  the opposite of the buried Start over D-091 fixed.
						*/}
						<button
							type="button"
							onClick={reset}
							className="explore__offer text-caption"
						>
							Rather have picks chosen for you? Answer three questions
						</button>

						{/* Their own trail, not personalisation — kept when it
						    exists, absent on the clean first visit. */}
						{entries.length > 0 && (
							<section className="bento__tile explore__resume">
								<ContinueReading
									entries={entries}
									onRemove={remove}
									onClear={clear}
								/>
							</section>
						)}
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
						{/*
						  The filter is its own slim tile now (D-098, the owner's
						  mock): adjacency carries the "this governs that" reading
						  D-090 used one shared surface for, and the results tile
						  stops being a wall — the page gets rhythm between cards
						  instead of one uninterrupted block.
						*/}
						{/*
						  No surface (D-098). The chips are bordered pills already;
						  a card around a row of pills is a box around boxes — the
						  D-069 reasoning, one level up. The filter is a quiet strip
						  on the canvas, and the results card below is the page's
						  one tile.
						*/}
						{/*
						  A bar from lg (D-099, the owner's mock): the words on the
						  page's left axis, the chips on the right — one line where
						  three used to stack. Below lg it keeps the stack; a
						  wrapped right-aligned cluster under a left heading reads
						  as broken, so the narrow layout never attempts it.
						*/}
						<section className="bento__filter">
							<div className="bento__filter-words">
								<h2 className="mb-1 text-micro font-semibold uppercase tracking-label text-ink">
									Tuned to your answers
								</h2>
								<p className="bento__filter-note mb-3 text-caption text-ink-faint">
									Change any answer without starting over.
								</p>
							</div>
							<TasteChips
								preferences={preferences}
								onChange={save}
								onStartOver={reset}
							/>
						</section>

						<section className="bento__tile bento__results">
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
									<SectionHeading lead="Three from a catalogue we chose by hand. They change every time you come back.">
										Deep Dives
									</SectionHeading>

									{/*
									  The shuffle is the shelf's own ghost card now
									  (D-097) — the control lives inside the thing
									  it re-picks, and both shelves still re-enter
									  together on the rotation key (D-091).
									*/}
									<DeepDives
										picks={dives}
										preferences={preferences}
										onShuffle={shuffle}
									/>
								</div>

								{/*
								  Below the cards, not beside them (D-091): a side
								  column always outran the three cards and left a
								  dead zone under them. Full width, the list runs
								  three columns and the region closes flush.
								*/}
								<aside
									className="bento__also"
									data-open={alsoOpen || undefined}
								>
									<button
										type="button"
										className="bento__also-toggle"
										aria-expanded={alsoOpen}
										aria-controls="also-liked"
										onClick={() => {
											setAlsoOpen(!alsoOpen);
											if (!alsoOpen) setAlsoEverOpen(true);
										}}
									>
										<span className="text-micro font-semibold uppercase tracking-label text-ink">
											People also like
										</span>
										{/* The chevron says which way the row will move. */}
										<svg
											className="bento__also-chevron"
											viewBox="0 0 12 12"
											width="12"
											height="12"
											aria-hidden="true"
											focusable="false"
										>
											<path
												d="M2 4 L6 8 L10 4"
												fill="none"
												stroke="currentColor"
												strokeWidth="1.6"
												strokeLinecap="round"
												strokeLinejoin="round"
											/>
										</svg>
									</button>

									<div id="also-liked" className="bento__also-body">
										<div className="bento__also-inner">
											<p className="mb-4 text-caption text-ink-faint">
												More from the same catalogue, ranked further
												down your answers.
											</p>
											<AlsoLiked picks={also} art={alsoEverOpen} />
											{/*
											  Deepens THIS shelf only (D-101) — the count
											  is separate from the shuffle, which re-deals
											  at the reader's chosen depth.
											*/}
											{!alsoExhausted && (
												<button
													type="button"
													onClick={() => setAlsoCount((c) => c + 12)}
													className="bento__also-more px-4 py-2 text-micro"
												>
													Load more
												</button>
											)}
										</div>
									</div>
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
