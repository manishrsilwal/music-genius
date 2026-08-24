import { Await } from "@tanstack/react-router";
import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

import { measureEm } from "@/lib/card";
import { riseVariants, staggerVariants, transition } from "@/lib/motion";
import type { Track, TrackVisuals } from "@/lib/types";

import "./track-hero.scss";

/**
 * Immersive hero (PRD §3.2).
 *
 * The type renders immediately; the album art streams in behind it (D-017).
 * Because the art layer is absolutely positioned, arriving late costs no
 * reflow — it fades in beneath type that has not moved.
 *
 * The art is decorative: it carries nothing the title and artist below don't
 * already state, so it is hidden from assistive tech. With no artwork at all
 * the hero is pure typography on the canvas colour, which is a deliberate
 * fallback rather than a broken state.
 */
export function TrackHero({
	track,
	visuals,
	player,
	notice,
}: {
	track: Track;
	visuals: Promise<TrackVisuals>;
	/** The playback bar, opening here before it docks (D-038). */
	player?: ReactNode;
	/**
	 * A caveat about this recording, when there is one (OD-028). Passed in
	 * rather than imported, the same way the player is: the hero has no
	 * business knowing what makes a recording a variant, and discovery has no
	 * business knowing how the hero is laid out.
	 */
	notice?: ReactNode;
}) {
	return (
		<motion.header
			className="hero flex min-h-dvh flex-col items-center justify-center px-6"
			variants={staggerVariants}
			initial="hidden"
			animate="visible"
		>
			<Await promise={visuals} fallback={null}>
				{({ artwork }) =>
					artwork ? (
						<>
							<div className="hero__art" aria-hidden="true">
								<motion.img
									src={artwork.full}
									alt=""
									initial={{ opacity: 0, scale: 1.35 }}
									// 0.45, not 1 (D-078). The sharp cover in the
									// lockup is now the artwork's appearance; at
									// full strength the blurred ground behind it
									// read as the same image shown twice at once.
									animate={{ opacity: 0.45, scale: 1.25 }}
									transition={transition.cinematic}
								/>
							</div>
							<motion.div
								className="hero__veil"
								aria-hidden="true"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={transition.cinematic}
							/>
						</>
					) : null
				}
			</Await>

			{/*
			  The lockup (D-078): cover beside the words on a wide screen, above
			  them on a phone. The reference's composition, chosen with the seam
			  known — the canvas below stays centred, so the hero re-centres
			  everything below `md` rather than carrying a left axis into it.
			*/}
			<div className="hero__lockup">
				<Await promise={visuals} fallback={null}>
					{({ artwork }) =>
						artwork ? (
							<motion.div
								className="hero__cover"
								aria-hidden="true"
								variants={riseVariants}
								transition={transition.cinematic}
							>
								<img src={artwork.full} alt="" />
							</motion.div>
						) : null
					}
				</Await>

				<div className="hero__text">
					<motion.p
						variants={riseVariants}
						className="text-micro uppercase tracking-label text-ink-faint"
					>
						{track.synced ? "Time-synced" : "Lyrics"}
					</motion.p>

					{/*
					  The measure the title is fitted against. A container rather
					  than the heading itself: an element cannot query its own
					  width (D-037) — which is also what makes the fit survive
					  this layout change: `cqw` resolves against whatever column
					  the measure occupies, so the same arithmetic fits the title
					  to the narrower beside-column with no new numbers.
					*/}
					<div className="hero__measure mt-8">
						<motion.h1
							variants={riseVariants}
							transition={transition.cinematic}
							className="hero__title text-ink"
							// Real glyph advances, not an assumed average — the same
							// table Satori renders cards from. The display face's widths
							// vary enough that "Creep" and "Nights" differ by 8% on
							// equal character counts.
							style={{ "--title-em": measureEm(track.title) } as CSSProperties}
						>
							{track.title}
						</motion.h1>
					</div>

					<motion.p
						variants={riseVariants}
						className="mt-8 text-lead text-ink-muted"
					>
						{track.artist}
						{/* Already null when it only repeats the artist or the title —
				    normalised at the LRCLIB boundary, not guarded here. */}
						{track.album ? ` · ${track.album}` : ""}
					</motion.p>
				</div>
			</div>

			{notice}

			{player}
		</motion.header>
	);
}
