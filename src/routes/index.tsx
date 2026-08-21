import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";

import { SearchField } from "@/features/discovery/components/search-field";
import { riseVariants, staggerVariants } from "@/lib/motion";

export const Route = createFileRoute("/")({ component: Discovery });

/**
 * Discovery (PRD §3.1).
 *
 * "Today's Deep Dives" needs pre-generated AI backstories, which are blocked on
 * OD-003/OD-004. Search ships first; the curated grid lands beneath it.
 */
function Discovery() {
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

			<motion.p
				variants={riseVariants}
				className="mt-6 max-w-md text-lead text-ink-muted"
			>
				Lyrics set like an essay, not a listing. Search a track to begin.
			</motion.p>

			<motion.div variants={riseVariants} className="mt-12">
				<SearchField />
			</motion.div>
		</motion.main>
	);
}
