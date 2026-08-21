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
	idle: 0.2,
} as const;

export const transition = {
	editorial: { duration: duration.base, ease: ease.editorial },
	quick: { duration: duration.quick, ease: ease.editorial },
	cinematic: { duration: duration.cinematic, ease: ease.entrance },
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
	active: { opacity: stanzaOpacity.active, transition: transition.editorial },
};

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
