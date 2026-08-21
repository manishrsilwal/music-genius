import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import type { Era, Language, Mood, Preferences } from "@/lib/deep-dives";
import { transition } from "@/lib/motion";

import { EMPTY_PREFERENCES } from "../hooks/use-preferences";
import "./preference-stepper.scss";

/**
 * Three questions, one per screen (PRD §3.1).
 *
 * Answers the brief's actual problem — "a blank search bar is intimidating" —
 * by asking rather than demanding. Every step is skippable and skipping is a
 * real answer: unanswered axes simply carry no weight in the ranking.
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

const LANGUAGE_OPTIONS: Option<Language>[] = [
	{ value: "english", label: "English", hint: "" },
	{ value: "hindi", label: "हिन्दी", hint: "Hindi" },
];

const ERA_OPTIONS: Option<Era>[] = [
	{ value: "classic", label: "Older", hint: "Before the 2000s" },
	{ value: "modern", label: "Newer", hint: "This century" },
];

const STEPS = 3;

export function PreferenceStepper({
	onComplete,
}: {
	onComplete: (preferences: Preferences) => void;
}) {
	const [step, setStep] = useState(0);
	const [draft, setDraft] = useState<Preferences>(EMPTY_PREFERENCES);

	function advance(next: Preferences) {
		setDraft(next);
		if (step === STEPS - 1) onComplete(next);
		else setStep(step + 1);
	}

	const question = [
		"What do you want to sit with?",
		"In which words?",
		"From when?",
	][step] as string;

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
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -8 }}
					transition={transition.editorial}
					className="grid gap-8"
				>
					<h2 className="stepper__question text-display text-ink">
						{question}
					</h2>

					<div className="stepper__options">
						{step === 0 &&
							MOOD_OPTIONS.map((option) => (
								<StepOption
									key={option.value}
									option={option}
									onSelect={() => advance({ ...draft, mood: option.value })}
								/>
							))}
						{step === 1 &&
							LANGUAGE_OPTIONS.map((option) => (
								<StepOption
									key={option.value}
									option={option}
									onSelect={() => advance({ ...draft, language: option.value })}
								/>
							))}
						{step === 2 &&
							ERA_OPTIONS.map((option) => (
								<StepOption
									key={option.value}
									option={option}
									onSelect={() => advance({ ...draft, era: option.value })}
								/>
							))}
					</div>

					<button
						type="button"
						className="stepper__skip text-micro"
						onClick={() => advance(draft)}
					>
						{step === STEPS - 1 ? "Skip · show me anything" : "Skip this"}
					</button>
				</motion.div>
			</AnimatePresence>
		</div>
	);
}

function StepOption<T extends string>({
	option,
	onSelect,
}: {
	option: Option<T>;
	onSelect: () => void;
}) {
	return (
		<button type="button" className="stepper__option" onClick={onSelect}>
			<span className="stepper__label text-title text-ink">{option.label}</span>
			{option.hint && (
				<span className="stepper__hint mt-1 text-caption">{option.hint}</span>
			)}
		</button>
	);
}
