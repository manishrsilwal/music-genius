import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import type { Familiarity, Mood, Preferences, Pull } from "@/lib/deep-dives";
import { transition } from "@/lib/motion";

import { EMPTY_PREFERENCES } from "../hooks/use-preferences";
import "./preference-stepper.scss";

/**
 * Three questions, one per screen (PRD §3.1).
 *
 * Every axis describes the READER, not the record. Language and era were tried
 * and removed: as binary partitions they halved the pool at each step and
 * forced a reader who enjoys both to pick a side (D-027).
 *
 * Skipping is a real answer — an unanswered axis simply carries no weight.
 */

interface Option<T> {
	value: T;
	label: string;
	hint: string;
}

const MOOD_OPTIONS: Option<Mood>[] = [
	{ value: "longing", label: "Longing", hint: "Distance, memory, ache" },
	{ value: "defiant", label: "Defiant", hint: "Anger with somewhere to go" },
	{ value: "tender", label: "Tender", hint: "Quiet, close, unguarded" },
	{ value: "restless", label: "Restless", hint: "Motion, nerve, escape" },
];

const PULL_OPTIONS: Option<Pull>[] = [
	{
		value: "storytelling",
		label: "The story",
		hint: "Songs that happen to someone",
	},
	{
		value: "wordplay",
		label: "The craft",
		hint: "Rhyme, turn, double meaning",
	},
	{
		value: "confession",
		label: "The honesty",
		hint: "Said plainly, unguarded",
	},
	{ value: "imagery", label: "The imagery", hint: "Pictures over statements" },
];

const FAMILIARITY_OPTIONS: Option<Familiarity>[] = [
	{ value: "canon", label: "The canon", hint: "Songs worth rereading" },
	{ value: "deep", label: "Deep cuts", hint: "Things you may not know" },
	{ value: "surprise", label: "Surprise me", hint: "No preference" },
];

const STEPS = 3;

export function PreferenceStepper({
	onComplete,
}: {
	onComplete: (preferences: Preferences) => void;
}) {
	const [step, setStep] = useState(0);
	const [draft, setDraft] = useState<Preferences>(EMPTY_PREFERENCES);

	function go(next: Preferences) {
		setDraft(next);
		if (step === STEPS - 1) onComplete(next);
		else setStep(step + 1);
	}

	function toggleMood(mood: Mood) {
		const moods = draft.moods.includes(mood)
			? draft.moods.filter((m) => m !== mood)
			: [...draft.moods, mood];
		setDraft({ ...draft, moods });
	}

	const question = [
		"What do you want to sit with?",
		"What pulls you into a song?",
		"How well should you know it?",
	][step] as string;

	const subtitle = step === 0 ? "Pick as many as you like" : null;

	return (
		<div className="stepper">
			{/* Marks, not a progress bar: a bar measures what is left, which is
			    the anxious framing. */}
			<div className="stepper__marks" aria-hidden="true">
				{Array.from({ length: STEPS }, (_, index) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length list
						key={index}
						className="stepper__mark"
						data-state={
							index < step ? "done" : index === step ? "current" : "todo"
						}
					/>
				))}
			</div>

			<AnimatePresence mode="wait">
				<motion.div
					key={step}
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -6 }}
					transition={transition.editorial}
					className="grid gap-5"
				>
					<div>
						<h2 className="stepper__question text-title text-ink">
							{question}
						</h2>
						{subtitle && (
							<p className="mt-1 text-caption text-ink-faint">{subtitle}</p>
						)}
					</div>

					<div className="stepper__options">
						{step === 0 &&
							MOOD_OPTIONS.map((option) => (
								<StepOption
									key={option.value}
									option={option}
									selected={draft.moods.includes(option.value)}
									onSelect={() => toggleMood(option.value)}
								/>
							))}
						{step === 1 &&
							PULL_OPTIONS.map((option) => (
								<StepOption
									key={option.value}
									option={option}
									onSelect={() => go({ ...draft, pull: option.value })}
								/>
							))}
						{step === 2 &&
							FAMILIARITY_OPTIONS.map((option) => (
								<StepOption
									key={option.value}
									option={option}
									onSelect={() => go({ ...draft, familiarity: option.value })}
								/>
							))}
					</div>

					<div className="flex items-center gap-4">
						{/* Multi-select needs an explicit commit; the single-choice
						    steps advance on tap and would find a button redundant. */}
						{step === 0 && draft.moods.length > 0 && (
							<button
								type="button"
								onClick={() => go(draft)}
								className="stepper__next text-micro uppercase tracking-label"
							>
								Continue · {draft.moods.length}
							</button>
						)}
						<button
							type="button"
							className="stepper__skip text-micro"
							onClick={() => go(draft)}
						>
							{step === STEPS - 1 ? "Skip · show me anything" : "Skip this"}
						</button>
					</div>
				</motion.div>
			</AnimatePresence>
		</div>
	);
}

function StepOption<T extends string>({
	option,
	selected = false,
	onSelect,
}: {
	option: Option<T>;
	selected?: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			className="stepper__option"
			aria-pressed={selected}
			data-selected={selected || undefined}
			onClick={onSelect}
		>
			<span className="stepper__label text-lead text-ink">{option.label}</span>
			<span className="stepper__hint mt-0.5 text-caption">{option.hint}</span>
		</button>
	);
}
