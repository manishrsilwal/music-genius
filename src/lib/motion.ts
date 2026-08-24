/**
 * Motion foundation — the single source of truth for animation.
 * See ARCHITECTURE.md D-004.
 *
 * Components must not contain magic numbers. Import duration, easing, and
 * variants from here so the whole app can be retuned in one place.
 *
 * Easing curves and stanza opacities are mirrored in src/styles.css for
 * CSS-driven cases. Changing one means changing the other.
 */

import type { Transition, Variants } from "motion/react";

/** Cubic-bezier control points. Mirrors --ease-* in styles.css. */
export const ease = {
	/** General-purpose editorial settle. Decisive start, long calm tail. */
	editorial: [0.22, 1, 0.36, 1],
	/** Entrances: content arriving without bounce. */
	entrance: [0.16, 1, 0.3, 1],
	/** Exits: accelerate away, no lingering. */
	exit: [0.7, 0, 0.84, 0],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** Seconds. Named by intent, not by value. */
export const duration = {
	instant: 0.12,
	quick: 0.22,
	base: 0.42,
	slow: 0.68,
	/** Hero and full-canvas transitions where the pacing is the point. */
	cinematic: 1.1,
} as const;

/** Scroll-spy opacity states. Mirrors --stanza-opacity-* in styles.css (PRD §3.3). */
export const stanzaOpacity = {
	active: 1,
	/**
	 * One stanza either side of the active one (D-074).
	 *
	 * Three steps instead of two, so attention falls off with distance rather
	 * than switching. Every value is measured against the reading ground:
	 * 1.0 is 18.56:1, this is 6.48:1, and idle below is 3.29:1.
	 */
	near: 0.62,
	// See --stanza-opacity-idle in styles.css, which is the source of the
	// number: 0.38 cleared the 3:1 large-text floor against the old reading
	// ground and stopped clearing it at 2.86:1 when D-064 lifted that ground.
	// 0.42 measures 3.24:1 (D-053, D-065).
	//
	// It is also the FLOOR, and the graded fade stops here rather than
	// continuing down. The player UI this idea came from fades its third line
	// to about 0.15 — 1.34:1, which is atmosphere in something you listen to
	// and unreadable in something you read (D-074).
	idle: 0.42,
} as const;

export const transition = {
	editorial: { duration: duration.base, ease: ease.editorial },
	quick: { duration: duration.quick, ease: ease.editorial },
	cinematic: { duration: duration.cinematic, ease: ease.entrance },
	/**
	 * Leaving under `AnimatePresence mode="wait"`, where exit and entrance run
	 * in sequence and the reader waits for both. Deliberately near-instant:
	 * what is leaving has already been decided, and matching the entrance
	 * duration doubles the perceived delay of every step.
	 */
	dismiss: { duration: duration.instant, ease: ease.exit },
	/** Bottom sheet + drawer drag release (PRD §3.5). Springs, not tweens —
      a gesture that ends must feel like it carries momentum. */
	sheet: { type: "spring", stiffness: 380, damping: 40, mass: 0.9 },
} as const satisfies Record<string, Transition>;

/* -------------------------------------------------------------------------
   Shared variants
   ---------------------------------------------------------------------- */

/** Stanza fade for the scrollytelling canvas (PRD §3.3). */
export const stanzaVariants: Variants = {
	idle: { opacity: stanzaOpacity.idle, transition: transition.editorial },
	near: { opacity: stanzaOpacity.near, transition: transition.editorial },
	active: { opacity: stanzaOpacity.active, transition: transition.editorial },
};

/**
 * Which of the three states a stanza is in, by its distance from the one being
 * read (D-074).
 *
 * Exported and pure so the ladder is testable without a DOM: the values are a
 * contrast decision, and a contrast decision should not live only inside a
 * component's render.
 */
export function stanzaState(
	index: number,
	activeIndex: number,
): "active" | "near" | "idle" {
	const distance = Math.abs(index - activeIndex);
	if (distance === 0) return "active";
	if (distance === 1) return "near";
	return "idle";
}

/** Editorial rise — the default entrance for content blocks. */
export const riseVariants: Variants = {
	hidden: { opacity: 0, y: 24 },
	visible: { opacity: 1, y: 0, transition: transition.editorial },
};

/** Staggered container for lists (Deep Dives grid, source gallery). */
export const staggerVariants: Variants = {
	hidden: {},
	visible: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};

/**
 * Reduced-motion policy (D-004).
 *
 * We degrade rather than disable. Time-synced auto-scroll still tracks the
 * audio — it jumps to position instead of easing there. Removing the feature
 * entirely would break the reading experience for the users who opted in.
 */
export const reducedTransition: Transition = { duration: 0 };

export function resolveTransition(
	preferred: Transition,
	prefersReducedMotion: boolean,
): Transition {
	return prefersReducedMotion ? reducedTransition : preferred;
}
