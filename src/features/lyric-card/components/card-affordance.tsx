import { AnimatePresence } from "motion/react";
import { useState } from "react";

import type { CardVariant } from "@/lib/card";
import type { Palette } from "@/lib/types";

import {
	type SelectionScope,
	useLineSelection,
} from "../hooks/use-line-selection";
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
	variant = "classic",
	scope,
}: {
	title: string;
	artist: string;
	palette: Palette | null;
	/** Which cut's card grammar the composer offers (D-132). */
	variant?: CardVariant;
	/** Where the lyric lines live — v2's reading page passes its own. */
	scope?: SelectionScope;
}) {
	const { selection, clear } = useLineSelection(scope);
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
						variant={variant}
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
