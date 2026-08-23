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
 * Every step advances on tap. Mood was briefly multi-select, which made it the
 * one step that could not — it needed a Continue button the other two made
 * look like friction (D-032). Three taps, no buttons.
 *
 * Skipping is a real answer — an unanswered axis simply carries no weight.
 */

export interface Option<T> {
	value: T;
	label: string;
	hint: string;
}

export const MOOD_OPTIONS: Option<Mood>[] = [
	{ value: "longing", label: "Longing", hint: "Distance, memory, ache" },
	{ value: "defiant", label: "Defiant", hint: "Anger with somewhere to go" },
	{ value: "tender", label: "Tender", hint: "Quiet, close, unguarded" },
	{ value: "restless", label: "Restless", hint: "Motion, nerve, escape" },
];

export const PULL_OPTIONS: Option<Pull>[] = [
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

export const FAMILIARITY_OPTIONS: Option<Familiarity>[] = [
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

	const question = [
		"What do you want to sit with?",
		"What pulls you into a song?",
		"How well should you know it?",
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
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -6, transition: transition.dismiss }}
					transition={transition.editorial}
					className="grid gap-5"
				>
					<h2 className="stepper__question text-title text-ink">{question}</h2>

					<div className="stepper__options">
						{step === 0 &&
							MOOD_OPTIONS.map((option) => (
								<StepOption
									key={option.value}
									option={option}
									onSelect={() => go({ ...draft, mood: option.value })}
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

					<div className="stepper__escapes">
						<button
							type="button"
							className="stepper__skip text-micro"
							onClick={() => go(draft)}
						>
							{step === STEPS - 1 ? "Skip this one" : "Skip this one"}
						</button>

						{/*
						  One escape, not three (D-064).

						  Skipping used to mean answering "skip" once per step, so a
						  reader who did not want to answer at all still had to work
						  through the whole flow to reach a search field. Three
						  dismissals is not an escape hatch, it is the same wizard with
						  different buttons.

						  This ends the stepper outright with whatever has been
						  answered so far — which is a real answer, since an unanswered
						  axis simply carries no weight in the ranking. It is styled as
						  a genuine alternative rather than as fine print, because for
						  a reader who arrived with a song in mind it is the ONLY thing
						  on this screen they want.
						*/}
						<button
							type="button"
							className="stepper__bail"
							onClick={() => onComplete(draft)}
						>
							Skip all — just let me search
						</button>
					</div>
				</motion.div>
			</AnimatePresence>
		</div>
	);
}

/**
 * No `aria-pressed` and no selected state: tapping an option advances, so an
 * option is never a toggle that sits pressed. Announcing one would describe a
 * control this is not.
 */
function StepOption<T extends string>({
	option,
	onSelect,
}: {
	option: Option<T>;
	onSelect: () => void;
}) {
	return (
		<button type="button" className="stepper__option" onClick={onSelect}>
			<span className="stepper__label text-lead text-ink">{option.label}</span>
			<span className="stepper__hint mt-0.5 text-caption">{option.hint}</span>
		</button>
	);
}
