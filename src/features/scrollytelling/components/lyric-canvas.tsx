import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef } from "react";

import { type LinePosition, lineKey } from "@/lib/lrc";
import { stanzaVariants } from "@/lib/motion";
import { detectLang } from "@/lib/script";
import type { Stanza } from "@/lib/types";

import { useScrollSpy } from "../hooks/use-scroll-spy";
import "./lyric-canvas.scss";

interface LyricCanvasProps {
	stanzas: Stanza[];
	/**
	 * Where the audio is, to the line (PRD §3.2). When set it overrides the
	 * scroll-spy and the canvas keeps pace with the song. Null means the reader
	 * is driving.
	 */
	syncPosition?: LinePosition | null;
}

/**
 * The scrollytelling canvas (PRD §3.3).
 *
 * The stanza at the centre of the viewport is fully opaque; every other stanza
 * falls to 20%. Opacity values come from lib/motion.ts — never inline.
 *
 * Two granularities on purpose: opacity is per stanza, because that is the
 * unit of reading attention, while auto-scroll follows the individual line,
 * because that is what keeps pace with the audio. Scrolling per stanza lurched
 * — stanzas run 30–70 seconds — and did nothing at all on the many LRC files
 * that carry no blank lines and so collapse to a single stanza.
 */
export function LyricCanvas({
	stanzas,
	syncPosition = null,
}: LyricCanvasProps) {
	const { activeIndex: spyIndex, register } = useScrollSpy(stanzas.length);
	const prefersReducedMotion = useReducedMotion();

	const lineElements = useRef<Map<string, HTMLElement>>(new Map());

	const registerLine = useCallback(
		(key: string) => (element: HTMLElement | null) => {
			if (element) lineElements.current.set(key, element);
			else lineElements.current.delete(key);
		},
		[],
	);

	// Audio wins while it is driving; otherwise the reader's position does.
	const activeIndex = syncPosition ? syncPosition.stanzaIndex : spyIndex;
	const syncKey = syncPosition?.key ?? null;

	// Keep the line being sung in the middle of the viewport. Reduced motion
	// still follows the song — it jumps rather than glides (D-004).
	useEffect(() => {
		if (!syncKey) return;
		const element = lineElements.current.get(syncKey);
		if (!element) return;

		element.scrollIntoView({
			behavior: prefersReducedMotion ? "auto" : "smooth",
			block: "center",
		});
	}, [syncKey, prefersReducedMotion]);

	/*
	 * Tell assistive technology what language it is looking at (D-053).
	 *
	 * The document is `lang="en"`, which is a lie for every non-Latin track —
	 * and this product ships a Devanagari face specifically because it expects
	 * those. A speech synthesiser given Devanagari under `lang="en"` produces
	 * noise rather than accented Hindi.
	 *
	 * Detected from the words themselves rather than from LRCLIB metadata,
	 * which carries no language field at all. Null for Latin scripts, where the
	 * document's own lang is the better answer.
	 */
	const lang = detectLang(
		stanzas
			.flatMap((stanza) => stanza.lines.map((line) => line.text))
			.join(" "),
	);

	return (
		<div className="canvas" lang={lang ?? undefined}>
			{stanzas.map((stanza, stanzaIndex) => {
				const isActive = stanzaIndex === activeIndex;
				return (
					<motion.p
						key={stanza.id}
						ref={register(stanzaIndex)}
						className="canvas__stanza text-ink"
						data-active={isActive}
						variants={stanzaVariants}
						initial={false}
						animate={isActive ? "active" : "idle"}
						transition={prefersReducedMotion ? { duration: 0 } : undefined}
					>
						{stanza.lines.map((line, lineIndex) => {
							const key = lineKey(stanzaIndex, lineIndex);
							return (
								<span
									// Lyrics legitimately repeat lines, so text alone is not a
									// key. Stanza content is static and never reorders, so the
									// index is stable.
									key={key}
									ref={registerLine(key)}
									className="canvas__line"
									data-sung={key === syncKey || undefined}
								>
									{line.text}
								</span>
							);
						})}
					</motion.p>
				);
			})}
		</div>
	);
}
