import {
	AnimatePresence,
	motion,
	useDragControls,
	useReducedMotion,
} from "motion/react";
import { useEffect, useRef } from "react";

import { transition } from "@/lib/motion";
import type { Insight } from "@/lib/types";
import type { InsightState } from "../hooks/use-insights";
import { useMediaQuery } from "../hooks/use-media-query";
import { InsightsContent } from "./insights-content";
import "./insights.scss";

/** Matches the `lg` breakpoint in styles/_breakpoints.scss. */
const DESKTOP = "(min-width: 64rem)";

/** Ties the trigger to the region it opens, for assistive technology. */
const PANEL_ID = "insights-panel";

/** Drag further than this and the sheet closes (PRD §3.5, swipeable). */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 500;

export function DiscoverButton({
	state,
	open,
	onToggle,
}: {
	state: InsightState;
	open: boolean;
	onToggle: () => void;
}) {
	// Nothing configured, or generation failed — say nothing rather than
	// advertise a feature that cannot deliver.
	if (state === "unavailable" || state === "failed") return null;

	const generating = state === "generating";

	return (
		<button
			type="button"
			data-state={state}
			disabled={generating}
			aria-expanded={open}
			// Names the region this controls. `aria-expanded` alone says
			// something opened without saying what (D-053).
			aria-controls={PANEL_ID}
			onClick={onToggle}
			className="discover px-5 py-3 text-caption uppercase tracking-label"
		>
			{/*
			  The label changes while a request is in flight, but a disabled
			  button is not announced when its text changes. `aria-live` on the
			  label makes the wait audible instead of silent — the generation
			  takes several seconds (D-050), which is long enough that silence
			  reads as breakage.
			*/}
			<span aria-live="polite">
				{generating
					? "Preparing the story"
					: open
						? "Close the story"
						: "Discover the story"}
			</span>
		</button>
	);
}

export function InsightsDrawer({
	insight,
	open,
	onClose,
}: {
	insight: Insight;
	open: boolean;
	onClose: () => void;
}) {
	const isDesktop = useMediaQuery(DESKTOP);
	const dragControls = useDragControls();
	const prefersReducedMotion = useReducedMotion();
	const panelRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	/**
	 * Move focus into the panel, and put it back when the panel goes (D-053).
	 *
	 * Without this a keyboard reader presses "Discover the story", the panel
	 * opens behind them, and Tab carries on through the lyrics underneath —
	 * the content they asked for is never reached. Returning focus matters as
	 * much as moving it: landing at the top of the document after a close is
	 * how a reader loses their place entirely.
	 *
	 * The panel itself takes focus rather than the first control inside it, so
	 * a screen reader announces the region and its label before its contents.
	 */
	useEffect(() => {
		if (!open) return;
		const restoreTo = document.activeElement as HTMLElement | null;
		panelRef.current?.focus();
		return () => {
			// Only if focus is still inside the panel. A reader who deliberately
			// clicked elsewhere before closing should not be yanked back.
			if (
				restoreTo?.isConnected &&
				panelRef.current?.contains(document.activeElement)
			) {
				restoreTo.focus();
			}
		};
	}, [open]);

	/**
	 * One scroll owner at a time (D-048).
	 *
	 * The panel is its own scroll container and the page behind it kept
	 * scrolling too, so both scrollbars sat against the right edge of the
	 * viewport — reading as a rendering fault rather than as two regions.
	 *
	 * Desktop only. On mobile the sheet covers the bottom half by design and
	 * the lyrics above it stay scrollable, which PRD §3.5 asks for explicitly.
	 * `scrollbar-gutter: stable` on the document keeps the gutter reserved, so
	 * locking does not shift the page sideways underneath the reader.
	 */
	useEffect(() => {
		if (!open || !isDesktop) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [open, isDesktop]);

	const motionProps = prefersReducedMotion
		? { initial: false as const, transition: { duration: 0 } }
		: {};

	return (
		<AnimatePresence>
			{open &&
				(isDesktop ? (
					<motion.aside
						key="panel"
						ref={panelRef}
						id={PANEL_ID}
						className="drawer-panel"
						aria-label="The story behind this song"
						// Desktop locks the page behind it, so it behaves modally
						// and must say so. The mobile sheet deliberately leaves
						// the lyrics scrollable (PRD §3.5) and is therefore NOT
						// modal — same component, honestly different semantics.
						role="dialog"
						aria-modal="true"
						tabIndex={-1}
						initial={{ x: "100%" }}
						animate={{ x: 0 }}
						exit={{ x: "100%" }}
						transition={transition.editorial}
						{...motionProps}
					>
						<InsightsContent insight={insight} />
					</motion.aside>
				) : (
					<motion.aside
						key="sheet"
						ref={panelRef}
						id={PANEL_ID}
						className="drawer-sheet"
						aria-label="The story behind this song"
						tabIndex={-1}
						initial={{ y: "100%" }}
						animate={{ y: 0 }}
						exit={{ y: "100%" }}
						transition={transition.sheet}
						drag="y"
						// Drag is started by the grip alone (below). Without this the
						// whole sheet is a drag surface and the body cannot scroll.
						dragListener={false}
						dragControls={dragControls}
						// Upward drag is clamped to nothing: the sheet is half the
						// screen by design, so growing it would cover the lyrics.
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0, bottom: 0.4 }}
						onDragEnd={(_event, info) => {
							if (
								info.offset.y > DISMISS_DISTANCE ||
								info.velocity.y > DISMISS_VELOCITY
							) {
								onClose();
							}
						}}
						{...motionProps}
					>
						{/*
						  The only drag surface, so the body below stays scrollable.
						  Hidden from assistive technology: it is a pointer
						  affordance with no keyboard equivalent, and Escape
						  already closes the sheet — announcing it would offer a
						  control that cannot be operated.
						*/}
						<div
							aria-hidden="true"
							className="drawer-sheet__grip"
							onPointerDown={(event) => dragControls.start(event)}
						/>
						<div className="drawer-sheet__body">
							<InsightsContent insight={insight} />
						</div>
					</motion.aside>
				))}
		</AnimatePresence>
	);
}
