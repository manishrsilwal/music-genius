import { motion } from "motion/react";

import { riseVariants, staggerVariants, transition } from "@/lib/motion";
import type { Track } from "@/lib/types";

import "./track-hero.scss";

/**
 * Immersive hero (PRD §3.2).
 *
 * The blurred album art is decorative — it carries no information the title and
 * artist below don't already state — so it is hidden from assistive tech.
 * Without artwork the hero degrades to pure typography on the canvas colour,
 * which is a deliberate fallback rather than a broken state.
 */
export function TrackHero({ track }: { track: Track }) {
	return (
		<motion.header
			className="hero flex min-h-dvh flex-col items-center justify-center px-6 text-center"
			variants={staggerVariants}
			initial="hidden"
			animate="visible"
		>
			{track.artwork && (
				<>
					<div className="hero__art" aria-hidden="true">
						<motion.img
							src={track.artwork.full}
							alt=""
							initial={{ opacity: 0, scale: 1.35 }}
							animate={{ opacity: 1, scale: 1.25 }}
							transition={transition.cinematic}
						/>
					</div>
					<div className="hero__veil" aria-hidden="true" />
				</>
			)}

			<motion.p
				variants={riseVariants}
				className="text-micro uppercase tracking-label text-ink-faint"
			>
				{track.synced ? "Time-synced" : "Lyrics"}
			</motion.p>

			<motion.h1
				variants={riseVariants}
				transition={transition.cinematic}
				className="hero__title mt-8 max-w-5xl text-ink"
			>
				{track.title}
			</motion.h1>

			<motion.p
				variants={riseVariants}
				className="mt-8 text-lead text-ink-muted"
			>
				{track.artist}
				{track.album ? ` · ${track.album}` : ""}
			</motion.p>
		</motion.header>
	);
}
