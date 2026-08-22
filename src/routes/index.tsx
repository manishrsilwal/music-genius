import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";

import {
	AlsoLiked,
	DeepDives,
} from "@/features/discovery/components/deep-dives";
import { PreferenceStepper } from "@/features/discovery/components/preference-stepper";
import { SearchField } from "@/features/discovery/components/search-field";
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
			className="landing mx-auto w-full max-w-2xl px-6"
			variants={staggerVariants}
			initial="hidden"
			animate="visible"
		>
			<motion.p
				variants={riseVariants}
				className="text-micro uppercase tracking-label text-ink-faint"
			>
				Typographic Lyrical Explorer
			</motion.p>

			<motion.h1
				variants={riseVariants}
				className="landing__title mt-3 text-ink"
			>
				Read the words properly.
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
						className="mt-8 grid gap-10"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={transition.editorial}
					>
						<SearchField />

						<section>
							<div className="mb-4 flex items-baseline justify-between gap-4">
								<h2 className="text-micro uppercase tracking-label text-ink-faint">
									Today's Deep Dives
								</h2>
								<button
									type="button"
									onClick={reset}
									className="text-micro uppercase tracking-label text-ink-faint hover:text-ink-muted"
								>
									Change taste
								</button>
							</div>
							<DeepDives picks={dives} preferences={preferences} />
						</section>

						<section>
							<h2 className="mb-3 text-micro uppercase tracking-label text-ink-faint">
								People also like
							</h2>
							<AlsoLiked picks={also} />
						</section>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.main>
	);
}
