import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";

import { DeepDives } from "@/features/discovery/components/deep-dives";
import { PreferenceStepper } from "@/features/discovery/components/preference-stepper";
import { SearchField } from "@/features/discovery/components/search-field";
import { usePreferences } from "@/features/discovery/hooks/use-preferences";
import { pickDeepDives, seedFromDate } from "@/lib/deep-dives";
import { riseVariants, staggerVariants, transition } from "@/lib/motion";

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
 * being handed an empty field, and the answers seed the day's Deep Dives.
 */
function Discovery() {
	const { today } = Route.useLoaderData();
	const { preferences, answered, save, reset } = usePreferences();

	const picks = useMemo(
		() => pickDeepDives(preferences, seedFromDate(today)),
		[preferences, today],
	);

	return (
		<motion.main
			className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-24"
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
				className="mt-6 font-display text-display leading-display tracking-display text-ink"
			>
				Read the words
				<br />
				properly.
			</motion.h1>

			<AnimatePresence mode="wait">
				{/* `answered` is null until localStorage has been read. Rendering
				    nothing until then avoids flashing the stepper at a returning
				    reader who already answered. */}
				{answered === null ? (
					<div key="waiting" className="mt-12 h-40" />
				) : answered === false ? (
					<motion.div
						key="stepper"
						className="mt-12"
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
						className="mt-12 grid gap-10"
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={transition.editorial}
					>
						<SearchField />

						<section>
							<div className="mb-4 flex items-baseline justify-between gap-4">
								<p className="text-micro uppercase tracking-label text-ink-faint">
									Today's Deep Dives
								</p>
								<button
									type="button"
									onClick={reset}
									className="text-micro uppercase tracking-label text-ink-faint hover:text-ink-muted"
								>
									Change taste
								</button>
							</div>
							<DeepDives picks={picks} />
						</section>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.main>
	);
}
