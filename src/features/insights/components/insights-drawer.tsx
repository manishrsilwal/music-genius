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
			// Disabling says the control is unavailable; it does not say why
			// (D-062). A screen reader reaching a dead button during a
			// multi-second synthesis has no way to know work is under way —
			// the visible label changes, but nothing announces it.
			aria-busy={generating}
			aria-expanded={open}
			// Names the region this controls. `aria-expanded` alone says
			// something opened without saying what (D-053).
			aria-controls={PANEL_ID}
			onClick={onToggle}
			className="discover px-5 py-3 text-caption uppercase tracking-label"
			// Same verified false positive as the playback toggle (D-110).
			suppressHydrationWarning
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

	const motionProps = prefersReducedMotion
		? { initial: false as const, transition: { duration: 0 } }
		: {};

	/*
	 * The panel's own dismissal (D-095). The rail button used to be the only
	 * close, two columns away from the thing it closed — the owner's report.
	 * Every surface owns its way out now, the same grammar as the track
	 * sheet's cross.
	 */
	const head = (
		<div className="drawer-head">
			<p className="drawer-head__title text-micro">The story</p>
			<button
				type="button"
				className="drawer-head__close"
				aria-label="Close the story"
				onClick={onClose}
			>
				<svg
					viewBox="0 0 14 14"
					width="12"
					height="12"
					aria-hidden="true"
					focusable="false"
				>
					<path
						d="M2.5 2.5 L11.5 11.5 M11.5 2.5 L2.5 11.5"
						stroke="currentColor"
						strokeWidth="1.6"
						strokeLinecap="round"
					/>
				</svg>
			</button>
		</div>
	);

	/*
	 * Desktop: the panel is ALWAYS mounted and the grid does the animating
	 * (D-096). The first spread mounted and unmounted the panel with the
	 * open state, and the close jittered: `data-drawer` collapsed the third
	 * grid track instantly while AnimatePresence held the exiting panel — a
	 * `grid-column: 3` child of a grid with no third column, wrapping
	 * mid-fade as the lyrics snapped wide. Two unsynchronised reflows.
	 *
	 * Now the third track transitions between 0 and its open width, and the
	 * panel sits inside a clipping rail at FIXED width, so its text never
	 * reflows — the story is revealed and concealed like a sliding door.
	 * `inert` while closed keeps the hidden copy out of the tab order and
	 * the accessibility tree; the aside stays non-modal (D-095).
	 */
	return isDesktop ? (
		<div className="drawer-rail" aria-hidden={open ? undefined : true}>
			<aside
				ref={panelRef}
				id={PANEL_ID}
				className="drawer-panel"
				aria-label="The story behind this song"
				tabIndex={-1}
				inert={open ? undefined : true}
			>
				{head}
				<InsightsContent insight={insight} />
			</aside>
		</div>
	) : (
		<AnimatePresence>
			{open && (
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
							{head}
							<InsightsContent insight={insight} />
						</div>
					</motion.aside>
			)}
		</AnimatePresence>
	);
}
