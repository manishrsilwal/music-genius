import { AnimatePresence } from "motion/react";
import { useState } from "react";

import type { Palette } from "@/lib/types";

import { useLineSelection } from "../hooks/use-line-selection";
import { CardComposer, SelectionTooltip } from "./card-composer";

/**
 * Ties selection to the composer (PRD §3.4).
 *
 * Kept separate from LyricCanvas so the canvas stays purely about reading.
 * Selection is observed at the document level, so this component renders no
 * markup inside the lyric flow and cannot disturb the scroll-spy.
 */
export function CardAffordance({
	title,
	artist,
	palette,
}: {
	title: string;
	artist: string;
	palette: Palette | null;
}) {
	const { selection, clear } = useLineSelection();
	const [composing, setComposing] = useState<string[] | null>(null);

	return (
		<>
			{selection && !composing && (
				<SelectionTooltip
					rect={selection.rect}
					count={selection.lines.length}
					onCreate={() => setComposing(selection.lines)}
				/>
			)}

			<AnimatePresence>
				{composing && (
					<CardComposer
						lines={composing}
						title={title}
						artist={artist}
						palette={palette}
						onClose={() => {
							setComposing(null);
							clear();
						}}
					/>
				)}
			</AnimatePresence>
		</>
	);
}
