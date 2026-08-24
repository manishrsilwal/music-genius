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

	const seed = seedFromDate(today);
	const dives = useMemo(
		() => pickDeepDives(preferences, seed),
		[preferences, seed],
	);
	const also = useMemo(
		() => pickAlsoLiked(preferences, seed, dives),
		[preferences, seed, dives],
	);

	return (
		<motion.main
			id="main"
			className="landing mx-auto w-full max-w-2xl px-6"
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
						className="mt-8"
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
						className="shelves mt-8 grid gap-10"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={transition.editorial}
					>
						{/*
						  Above the search field (D-056). A reader who has been here
						  before is likelier to be resuming than starting, and putting
						  the shelf below the field would make them look past the
						  thing they came back for.
						*/}
						<ContinueReading
							entries={entries}
							onRemove={remove}
							onClear={clear}
						/>

						{/*
						  The two ways in, presented together (D-059).
						
						  They used to sit at opposite ends of the page: the field
						  here, the mood chips far below inside Deep Dives. A reader
						  who did not have a song in mind had no way of knowing the
						  second route existed without scrolling past the thing they
						  could not use. Naming both at the moment of the choice is
						  the whole point — the PRD's own reasoning for the stepper
						  is that "a blank search bar is intimidating", and that does
						  not stop being true on the second visit.
						*/}
						<section className="entry">
							{/*
							  Names both routes in a sentence (D-063).
							
							  The section already showed the choice — a labelled field, a
							  ruled "or", labelled chips — but never said it. Structure
							  reads as a choice only to someone already looking for one;
							  a reader who does not have a song in mind sees a search box
							  and assumes that is the product. One line costs nothing and
							  removes the guess.
							
							  D-063 deliberately left this section headingless, so the
							  field's own visible label (D-060) was the only
							  heading-shaped thing in it. That was right when this was
							  the only unlabelled block on the page; with every other
							  section now opening on a rule and a label (D-069), the one
							  section without them read as a fragment of the one above.
							  The field's label is a different rank and still the only
							  thing naming the input.
							*/}
							<SectionHeading lead="Two ways in — look up a song you already love, or tell us how you want to feel and we will choose.">
								Start reading
							</SectionHeading>

							<SearchField />

							<p className="entry__or" aria-hidden="true">
								or
							</p>

							<h2 className="mb-1 text-micro font-semibold uppercase tracking-label text-ink">
								Start from a mood
							</h2>
							{/* The lead above already makes the offer; repeating "tell us
							    how you want to feel" here was the same sentence twice on
							    one screen. What is left is the part the lead does not say. */}
							<p className="mb-3 text-caption text-ink-faint">
								Change any answer without starting over.
							</p>
							<TasteChips
								preferences={preferences}
								onChange={save}
								onStartOver={reset}
							/>
						</section>

						<section>
							{/*
							  The lead says what the shelf is, which the label alone
							  did not. Three picks out of a hand-built catalogue is
							  an editorial claim; unlabelled it reads as the whole of
							  a thin library (D-056).
							*/}
							<SectionHeading lead="Three from a catalogue we chose by hand, matched to your answers and rotated daily.">
								Today's Deep Dives
							</SectionHeading>

							<DeepDives picks={dives} preferences={preferences} />
						</section>

						<section>
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
