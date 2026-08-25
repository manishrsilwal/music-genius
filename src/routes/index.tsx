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
			<motion.h1 variants={riseVariants} className="landing__title text-ink">
				<span className="landing__title-plain">Read the words</span>{" "}
				<em className="landing__title-fancy">properly</em>
			</motion.h1>

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
						  The result leads (D-089). With preferences answered this page
						  IS a results page, and the first cut of the bento opened on
						  the ways to ask again — the reader's picks sat entirely below
						  the fold, so the answered state looked identical to having
						  asked nothing. Deep Dives now takes the first row with the
						  mood chips beside it — the answer next to the question that
						  produced it — then the resume strip, then search.

						  The resume tile is gated on entries because ContinueReading
						  returns null for an empty history — and an empty tile would
						  render as a blank card, which reads as something failing to
						  load.
						*/}
						<section className="bento__tile bento__tile--dives">
							{/*
							  The lead says what the shelf is, which the label alone
							  did not. Three picks out of a hand-built catalogue is
							  an editorial claim; unlabelled it reads as the whole of
							  a thin library (D-056).
							*/}
							<SectionHeading
								lead="Three from a catalogue we chose by hand, matched to your answers. They change every time you come back."
								action={
									<button
										type="button"
										onClick={shuffle}
										className="tap text-micro uppercase tracking-label text-ink-faint hover:text-ink"
									>
										Show three more
									</button>
								}
							>
								Deep Dives
							</SectionHeading>

							<DeepDives picks={dives} preferences={preferences} />
						</section>
						<section className="bento__tile bento__tile--mood">
							<h2 className="mb-1 text-micro font-semibold uppercase tracking-label text-ink">
								Start from a mood
							</h2>
							{/* The search tile's lead already makes the offer; what is
							    left is the part the lead does not say. */}
							<p className="mb-3 text-caption text-ink-faint">
								Change any answer without starting over.
							</p>
							<TasteChips
								preferences={preferences}
								onChange={save}
								onStartOver={reset}
							/>
						</section>
						{entries.length > 0 && (
							<section className="bento__tile bento__tile--resume">
								<ContinueReading
									entries={entries}
									onRemove={remove}
									onClear={clear}
								/>
							</section>
						)}
						{/*
						  The second way in (D-059's offer, reordered by D-089): the
						  mood route now sits up top as the result's own controls, so
						  this tile no longer announces a fork — it is the lookup, for
						  the reader who arrived with a song already in mind.
						*/}
						<section className="bento__tile bento__tile--search">
							<SectionHeading lead="Already have a song in mind? Look it up and start reading.">
								Search
							</SectionHeading>

							<SearchField />
						</section>
						<section className="bento__tile bento__tile--also">
							<SectionHeading lead="More from the same catalogue, ranked further down your answers.">
								People also like
							</SectionHeading>
							<AlsoLiked picks={also} />
						</section>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.main>
	);
}
