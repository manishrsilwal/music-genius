import { useCallback, useEffect, useState } from "react";

import { MAX_LINES } from "@/lib/card";

/**
 * Detects a lyric selection and keeps its LINE STRUCTURE (PRD §3.4).
 *
 * The reader drags across text, and a card is built from lines: we find
 * every line ELEMENT the range touches so each stays its own entry. Within
 * the first and last of them, the text is clamped to what was actually
 * selected — taking touched lines whole turned a half-line drag into full
 * lines on the card (the owner's report), which put words on the export
 * the reader deliberately left out.
 *
 * Works for long-press too: on touch, a long-press produces a native selection,
 * so both interactions land here without separate handling.
 */

export interface LineSelection {
	lines: string[];
	/** Viewport-relative rect of the selection, for positioning the tooltip. */
	rect: DOMRect;
}

/**
 * Where lyric lines live in the DOM. v1's canvas is the default; v2's
 * reading page passes its own classes (D-132) — the hook was hardwired to
 * `.canvas`, which is why selection did nothing on the loud cut.
 */
export interface SelectionScope {
	root: string;
	line: string;
}

const DEFAULT_SCOPE: SelectionScope = {
	root: ".canvas",
	line: ".canvas__line",
};

export function useLineSelection(scope: SelectionScope = DEFAULT_SCOPE): {
	selection: LineSelection | null;
	clear: () => void;
} {
	const [selection, setSelection] = useState<LineSelection | null>(null);

	const clear = useCallback(() => {
		setSelection(null);
		window.getSelection()?.removeAllRanges();
	}, []);

	useEffect(() => {
		function read() {
			const active = window.getSelection();
			if (!active || active.isCollapsed || active.rangeCount === 0) {
				setSelection(null);
				return;
			}

			const range = active.getRangeAt(0);
			const container =
				range.commonAncestorContainer instanceof Element
					? range.commonAncestorContainer
					: range.commonAncestorContainer.parentElement;

			const canvas = container?.closest(scope.root);
			if (!canvas) {
				// Selection outside the lyric canvas is none of our business.
				setSelection(null);
				return;
			}

			const touched = [...canvas.querySelectorAll(scope.line)].filter((line) =>
				range.intersectsNode(line),
			);

			/*
			 * Each line's text, CLAMPED to the selection (owner's report:
			 * "I only selected these text, but the card shows the whole
			 * lines"). The original snap took every touched line whole; now
			 * the lines still arrive as separate entries — the structure the
			 * card is built from survives — but the first and last carry
			 * only the words the reader actually chose.
			 */
			const lines = touched
				.map((line) => {
					const lineRange = document.createRange();
					lineRange.selectNodeContents(line);
					if (
						lineRange.compareBoundaryPoints(Range.START_TO_START, range) < 0
					) {
						lineRange.setStart(range.startContainer, range.startOffset);
					}
					if (lineRange.compareBoundaryPoints(Range.END_TO_END, range) > 0) {
						lineRange.setEnd(range.endContainer, range.endOffset);
					}
					return lineRange.toString().trim();
				})
				.filter((text) => text.length > 0);

			if (lines.length === 0 || lines.length > MAX_LINES) {
				setSelection(null);
				return;
			}

			setSelection({ lines, rect: range.getBoundingClientRect() });
		}

		// selectionchange fires continuously during a drag; reading on settle
		// keeps the tooltip from flickering under the cursor.
		let frame = 0;
		const onChange = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(read);
		};

		document.addEventListener("selectionchange", onChange);
		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener("selectionchange", onChange);
		};
	}, [scope.root, scope.line]);

	return { selection, clear };
}
