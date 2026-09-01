import { useCallback, useEffect, useState } from "react";

import { MAX_LINES } from "@/lib/card";

/**
 * Detects a lyric selection and snaps it to whole lines (PRD §3.4).
 *
 * The reader drags across text, but a card is built from lines, not from
 * characters. Rather than take the raw selected string — which would clip
 * mid-word and lose the line structure — we find every line ELEMENT the range
 * touches and take those lines whole. Dragging halfway through a line still
 * yields that entire line.
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

			const lines = touched
				.map((line) => line.textContent?.trim() ?? "")
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
