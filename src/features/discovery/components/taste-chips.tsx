import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import type { Familiarity, Mood, Preferences, Pull } from "@/lib/deep-dives";
import { transition } from "@/lib/motion";

import {
	FAMILIARITY_OPTIONS,
	MOOD_OPTIONS,
	type Option,
	PULL_OPTIONS,
} from "./preference-stepper";
import "./taste-chips.scss";

/**
 * The reader's taste, shown and editable in place (D-056).
 *
 * Replaces a "Change taste" button that cleared all three answers and restarted
 * the stepper — so a reader whose mood had changed had to re-answer what pulls
 * them and how familiar they wanted it, to change one thing.
 *
 * It also makes the answers visible at all. After the stepper closed they were
 * invisible, which left the shelf's reasoning opaque: the cards say "for
 * longing, the honesty" without anything on the page confirming that is what
 * the reader asked for.
 */

type Axis = "mood" | "pull" | "familiarity";

const AXES: {
	key: Axis;
	label: string;
	options: Option<string>[];
}[] = [
	{ key: "mood", label: "Mood", options: MOOD_OPTIONS },
	{ key: "pull", label: "Drawn to", options: PULL_OPTIONS },
	{ key: "familiarity", label: "Familiarity", options: FAMILIARITY_OPTIONS },
];

/** The stated answer, or an honest blank. */
function labelFor(axis: Axis, preferences: Preferences): string {
	const value = preferences[axis];
	if (!value) return "Any";
	const found = AXES.find((a) => a.key === axis)?.options.find(
		(option) => option.value === value,
	);
	return found?.label ?? "Any";
}

export function TasteChips({
	preferences,
	onChange,
	onStartOver,
}: {
	preferences: Preferences;
	onChange: (next: Preferences) => void;
	onStartOver: () => void;
}) {
	const [open, setOpen] = useState<Axis | null>(null);

	const choose = (axis: Axis, value: string) => {
		// One axis at a time. The other two are carried through untouched,
		// which is the whole point of this control.
		onChange({
			...preferences,
			[axis]:
				axis === "mood"
					? (value as Mood)
					: axis === "pull"
						? (value as Pull)
						: (value as Familiarity),
		});
		setOpen(null);
	};

	return (
		<div className="taste">
			<div className="taste__row">
				{AXES.map((axis) => (
					<button
						key={axis.key}
						type="button"
						className="taste__chip text-micro"
						data-open={open === axis.key || undefined}
						aria-expanded={open === axis.key}
						onClick={() => setOpen(open === axis.key ? null : axis.key)}
					>
						<span className="taste__chip-label">{axis.label}</span>
						<span className="taste__chip-value">
							{labelFor(axis.key, preferences)}
						</span>
					</button>
				))}

				<button
					type="button"
					onClick={onStartOver}
					className="taste__reset text-micro uppercase tracking-label"
				>
					{/* Decorative — the label beside it says the same thing. */}
					<svg
						viewBox="0 0 14 14"
						width="12"
						height="12"
						aria-hidden="true"
						focusable="false"
					>
						<path
							d="M2.5 7 A4.5 4.5 0 1 1 4 10.4"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
						/>
						<path d="M2 4.2 L2.6 7.6 L5.8 6.4 Z" fill="currentColor" />
					</svg>
					Retake
				</button>
			</div>

			<AnimatePresence mode="wait">
				{open && (
					<motion.div
						key={open}
						className="taste__options"
						initial={{ opacity: 0, y: -6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -6, transition: transition.dismiss }}
						transition={transition.editorial}
					>
						{AXES.find((a) => a.key === open)?.options.map((option) => (
							<button
								key={option.value}
								type="button"
								className="taste__option"
								data-selected={preferences[open] === option.value || undefined}
								onClick={() => choose(open, option.value)}
							>
								<span className="taste__option-label text-caption">
									{option.label}
								</span>
								<span className="taste__option-hint text-micro">
									{option.hint}
								</span>
							</button>
						))}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
