import { motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";

import { stanzaVariants } from "@/lib/motion";
import type { Stanza } from "@/lib/types";

import { useScrollSpy } from "../hooks/use-scroll-spy";
import "./lyric-canvas.scss";

interface LyricCanvasProps {
	stanzas: Stanza[];
	/**
	 * Stanza the audio is currently on (PRD §3.2). When set, it overrides the
	 * scroll-spy and the canvas scrolls itself to keep up. Null means the
	 * reader is driving.
	 */
	syncIndex?: number | null;
	/** Notifies the page which stanza is centred, for future audio sync (PRD §3.2). */
	onActiveChange?: (index: number) => void;
}

/**
 * The scrollytelling canvas (PRD §3.3).
 *
 * The stanza at the centre of the viewport is fully opaque; every other stanza
 * falls to 20%. Opacity values come from lib/motion.ts — never inline.
 */
export function LyricCanvas({ stanzas, syncIndex = null }: LyricCanvasProps) {
	const {
		activeIndex: spyIndex,
		register,
		elements,
	} = useScrollSpy(stanzas.length);
	const prefersReducedMotion = useReducedMotion();

	// Audio wins when it is driving; otherwise the reader's position does.
	const activeIndex = syncIndex ?? spyIndex;

	// Keep the sung stanza in the centre of the viewport. Reduced motion still
	// tracks the song — it jumps rather than glides (D-004).
	useEffect(() => {
		if (syncIndex === null) return;
		const element = elements.current.get(syncIndex);
		if (!element) return;

		element.scrollIntoView({
			behavior: prefersReducedMotion ? "auto" : "smooth",
			block: "center",
		});
	}, [syncIndex, elements, prefersReducedMotion]);

	return (
		<div className="canvas">
			{stanzas.map((stanza, index) => {
				const isActive = index === activeIndex;
				return (
					<motion.p
						key={stanza.id}
						ref={register(index)}
						className="canvas__stanza text-ink"
						data-active={isActive}
						variants={stanzaVariants}
						initial={false}
						animate={isActive ? "active" : "idle"}
						transition={prefersReducedMotion ? { duration: 0 } : undefined}
					>
						{stanza.lines.map((line, lineIndex) => (
							<span
								// Lyrics legitimately repeat lines, so text alone is not a key.
								// Stanza content is static and never reorders, so the index is stable.
								// biome-ignore lint/suspicious/noArrayIndexKey: stable, non-reordering list
								key={`${stanza.id}-${lineIndex}`}
								className="canvas__line"
							>
								{line.text}
							</span>
						))}
					</motion.p>
				);
			})}
		</div>
	);
}
