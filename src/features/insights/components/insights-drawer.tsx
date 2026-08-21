import {
	AnimatePresence,
	motion,
	useDragControls,
	useReducedMotion,
} from "motion/react";
import { useEffect } from "react";

import { transition } from "@/lib/motion";
import type { Insight } from "@/lib/types";
import type { InsightState } from "../hooks/use-insights";
import { useMediaQuery } from "../hooks/use-media-query";
import { InsightsContent } from "./insights-content";
import "./insights.scss";

/** Matches the `lg` breakpoint in styles/_breakpoints.scss. */
const DESKTOP = "(min-width: 64rem)";

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
			onClick={onToggle}
			className="discover px-5 py-3 text-caption uppercase tracking-label"
		>
			{generating
				? "Preparing the story"
				: open
					? "Close the story"
					: "Discover the story"}
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

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	const motionProps = prefersReducedMotion
		? { initial: false as const, transition: { duration: 0 } }
		: {};

	return (
		<AnimatePresence>
			{open &&
				(isDesktop ? (
					<motion.aside
						key="panel"
						className="drawer-panel"
						aria-label="The story behind this song"
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
						className="drawer-sheet"
						aria-label="The story behind this song"
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
						{/* The only drag surface, so the body below stays scrollable. */}
						{/* biome-ignore lint/a11y/noStaticElementInteractions: drag affordance; Escape and the button both close */}
						<div
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
