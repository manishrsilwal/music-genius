import { motion, useReducedMotion } from "motion/react";

import { stanzaVariants } from "@/lib/motion";
import type { Stanza } from "@/lib/types";

import { useScrollSpy } from "../hooks/use-scroll-spy";
import "./lyric-canvas.scss";

interface LyricCanvasProps {
	stanzas: Stanza[];
	/** Notifies the page which stanza is centred, for future audio sync (PRD §3.2). */
	onActiveChange?: (index: number) => void;
}

/**
 * The scrollytelling canvas (PRD §3.3).
 *
 * The stanza at the centre of the viewport is fully opaque; every other stanza
 * falls to 20%. Opacity values come from lib/motion.ts — never inline.
 */
export function LyricCanvas({ stanzas }: LyricCanvasProps) {
	const { activeIndex, register } = useScrollSpy(stanzas.length);
	const prefersReducedMotion = useReducedMotion();

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
