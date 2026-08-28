import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Tick } from "@/components/tick";
import {
	FAMILIARITY_OPTIONS,
	LANGUAGE_OPTIONS,
	type Language,
	MOOD_OPTIONS,
	type Option,
	orderLanguagesByLocale,
	type Preferences,
	PULL_OPTIONS,
} from "@/lib/deep-dives";
import {
	CHAT_STEPS,
	type Heard,
	heardLabels,
	heardNothing,
	interpretLocally,
	mergeHeard,
} from "@/lib/feelings";
import { transition } from "@/lib/motion";

import { EMPTY_PREFERENCES } from "../hooks/use-preferences";
import "./preference-chat.scss";

/**
 * The feelings chat (D-122) — the stepper's successor as the whole
 * personalisation flow.
 *
 * Same four questions, asked as a conversation: chips advance on tap
 * (D-032's rule, worn as chat), the languages step keeps its multi-select
 * exception (D-120), and the one full escape survives (D-064). What the
 * stepper could not do is the reason this exists: a reader can now just SAY
 * it — "went through a breakup, something in Hindi" — and the AI reader
 * turns the words into enums, which come back as a WRITTEN sentence the
 * reader confirms before anything filters. The model proposes, code
 * validates, the reader blesses. When the wire fails, a local keyword
 * reader answers instead, and when neither hears anything, the chips are
 * still right there — the conversation never dead-ends.
 *
 * Every visible word is written here, never generated: the interpreter
 * returns enums only, and `heardLabels` re-speaks them in the option
 * lists' own vocabulary.
 */

interface Bubble {
	id: number;
	from: "bot" | "reader";
	text: string;
}

type Stage = { kind: "ask"; step: number } | { kind: "confirm"; heard: Heard };

const GREETING =
	"Tell me how you're feeling — type it in your own words, or tap your way through. Your shelves tune to whatever you give me.";

export function PreferenceChat({
	onComplete,
}: {
	onComplete: (preferences: Preferences) => void;
}) {
	const reduce = useReducedMotion();
	const [draft, setDraft] = useState<Preferences>(EMPTY_PREFERENCES);
	const [stage, setStage] = useState<Stage>({ kind: "ask", step: 0 });
	const [busy, setBusy] = useState(false);
	const [text, setText] = useState("");
	const [bubbles, setBubbles] = useState<Bubble[]>([
		{ id: 0, from: "bot", text: GREETING },
		{ id: 1, from: "bot", text: CHAT_STEPS[0].question },
	]);
	const nextId = useRef(2);

	/* The reader's own languages first (D-120), read once (stable list). */
	const [languageOptions] = useState(() =>
		orderLanguagesByLocale(
			typeof navigator === "undefined" ? [] : navigator.languages,
		),
	);

	const endRef = useRef<HTMLDivElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll follows the thread, not the flags
	useEffect(() => {
		endRef.current?.scrollIntoView({
			behavior: reduce ? "auto" : "smooth",
			block: "nearest",
		});
	}, [bubbles, busy]);

	function say(from: Bubble["from"], text: string) {
		setBubbles((current) => [...current, { id: nextId.current++, from, text }]);
	}

	/** The first question not yet answered, or -1 when the tour is done. */
	function nextUnanswered(preferences: Preferences, after: number): number {
		for (let step = after; step < CHAT_STEPS.length; step++) {
			const axis = CHAT_STEPS[step]?.axis;
			if (axis === "languages") {
				if (!preferences.languages) return step;
			} else if (axis && !preferences[axis]) {
				return step;
			}
		}
		return -1;
	}

	function advance(updated: Preferences, from: number) {
		const step = nextUnanswered(updated, from + 1);
		if (step === -1) {
			onComplete(updated);
			return;
		}
		say("bot", CHAT_STEPS[step]?.question ?? "");
		setStage({ kind: "ask", step });
	}

	function tap<T extends string>(option: Option<T>, step: number) {
		const axis = CHAT_STEPS[step]?.axis;
		if (!axis || axis === "languages") return;
		say("reader", option.label);
		const updated = { ...draft, [axis]: option.value };
		setDraft(updated);
		advance(updated, step);
	}

	function skip(step: number) {
		say("reader", "Skip this one");
		if (step >= CHAT_STEPS.length - 1) {
			onComplete(draft);
			return;
		}
		say("bot", CHAT_STEPS[step + 1]?.question ?? "");
		setStage({ kind: "ask", step: step + 1 });
	}

	function toggleLanguage(value: Language) {
		const current = draft.languages ?? [];
		const next = current.includes(value)
			? current.filter((entry) => entry !== value)
			: [...current, value];
		setDraft({ ...draft, languages: next.length > 0 ? next : null });
	}

	function finishLanguages() {
		const chosen = (draft.languages ?? [])
			.map(
				(value) =>
					LANGUAGE_OPTIONS.find((option) => option.value === value)?.label,
			)
			.filter(Boolean);
		say("reader", chosen.length > 0 ? chosen.join(" + ") : "Any language");
		onComplete(draft);
	}

	async function submitText(event: React.FormEvent) {
		event.preventDefault();
		const message = text.trim();
		if (!message || busy) return;
		setText("");
		say("reader", message);
		setBusy(true);

		// The wire first; the local keyword reader when it fails or shrugs.
		// Both funnel into the same confirmation — where the words came from
		// matters less than the reader agreeing with them.
		let heard: Heard | null = null;
		try {
			const response = await fetch("/api/interpret", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ message }),
			});
			if (response.ok) {
				heard = ((await response.json()) as { heard: Heard | null }).heard;
			}
		} catch {
			// Offline or blocked; the local reader answers below.
		}
		if (!heard || heardNothing(heard)) {
			const local = interpretLocally(message);
			heard = heardNothing(local) ? null : local;
		}
		setBusy(false);

		if (!heard) {
			say(
				"bot",
				"I couldn't quite catch that — say it another way, or the chips below always work.",
			);
			return;
		}
		say(
			"bot",
			`Sounds like ${joinLabels(heardLabels(heard))} — did I hear that right?`,
		);
		setStage({ kind: "confirm", heard });
	}

	function confirmHeard(heard: Heard) {
		say("reader", "That's right");
		onComplete(mergeHeard(draft, heard));
	}

	function rejectHeard() {
		say("reader", "Not quite");
		const step = stage.kind === "ask" ? stage.step : nextUnanswered(draft, 0);
		const resume = step === -1 ? CHAT_STEPS.length - 1 : step;
		say("bot", CHAT_STEPS[resume]?.question ?? "");
		setStage({ kind: "ask", step: resume });
	}

	const step = stage.kind === "ask" ? stage.step : -1;
	const axis = step >= 0 ? CHAT_STEPS[step]?.axis : undefined;

	return (
		<div className="chat">
			{/* aria-live, so the bot's next question is announced without the
			    thread stealing focus from the chips. */}
			<div className="chat__thread" role="log" aria-live="polite">
				{bubbles.map((bubble) => (
					<motion.p
						key={bubble.id}
						className="chat__bubble"
						data-from={bubble.from}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={transition.editorial}
					>
						{bubble.text}
					</motion.p>
				))}
				{busy && (
					<p className="chat__bubble chat__bubble--waiting" data-from="bot">
						Reading that…
					</p>
				)}
				<div ref={endRef} />
			</div>

			<div className="chat__chips">
				{axis === "mood" &&
					MOOD_OPTIONS.map((option) => (
						<Chip
							key={option.value}
							option={option}
							onTap={() => tap(option, step)}
						/>
					))}
				{axis === "pull" &&
					PULL_OPTIONS.map((option) => (
						<Chip
							key={option.value}
							option={option}
							onTap={() => tap(option, step)}
						/>
					))}
				{axis === "familiarity" &&
					FAMILIARITY_OPTIONS.map((option) => (
						<Chip
							key={option.value}
							option={option}
							onTap={() => tap(option, step)}
						/>
					))}
				{axis === "languages" && (
					<>
						{languageOptions.map((option) => {
							const selected = (draft.languages ?? []).includes(option.value);
							return (
								<button
									key={option.value}
									type="button"
									className="chat__chip"
									aria-pressed={selected}
									data-selected={selected || undefined}
									onClick={() => toggleLanguage(option.value)}
								>
									{/* The tick says "chosen" at a glance — the lime
									    hairline alone was not obvious (owner's report). */}
									{selected && <Tick className="chat__tick" />}
									{option.label}
								</button>
							);
						})}
						<button
							type="button"
							className="chat__chip chat__chip--bright"
							onClick={finishLanguages}
						>
							{(draft.languages ?? []).length > 0
								? "Show my songs"
								: "Any language is fine"}
						</button>
					</>
				)}
				{stage.kind === "ask" && axis !== "languages" && (
					<button
						type="button"
						className="chat__chip chat__chip--quiet"
						onClick={() => skip(step)}
					>
						Skip this one
					</button>
				)}
				{stage.kind === "confirm" && (
					<>
						<button
							type="button"
							className="chat__chip chat__chip--bright"
							onClick={() => confirmHeard(stage.heard)}
						>
							That's right — show my songs
						</button>
						<button type="button" className="chat__chip" onClick={rejectHeard}>
							Not quite — let me choose
						</button>
					</>
				)}
			</div>

			<form className="chat__composer" onSubmit={submitText}>
				<input
					className="chat__input"
					type="text"
					value={text}
					maxLength={400}
					placeholder="Say it in your own words — “just went through a breakup”"
					aria-label="Tell us how you're feeling"
					onChange={(event) => setText(event.target.value)}
				/>
				<button
					type="submit"
					className="chat__send"
					disabled={busy || text.trim().length === 0}
				>
					Send
				</button>
			</form>

			{/*
			  The privacy split, said where it applies: chips are local like
			  everything else here; typed words are the ONE thing that crosses
			  the wire, and only to be read. One escape, not three (D-064).
			*/}
			<div className="chat__foot">
				<p className="chat__privacy text-micro">
					Taps stay on this device. Typed words are sent once to be understood,
					and not kept.
				</p>
				<button
					type="button"
					className="chat__bail"
					onClick={() => onComplete(draft)}
				>
					Skip all — just let me search
				</button>
			</div>
		</div>
	);
}

/** "a and b", "a, b and c" — a list a person would say out loud. */
function joinLabels(labels: string[]): string {
	if (labels.length <= 1) return labels[0] ?? "";
	return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/**
 * An advance-on-tap chip: no pressed state, because tapping moves the
 * conversation on — the same reasoning the stepper's options carried.
 * The hint rides the accessible name, so "Longing" reads as "Longing —
 * distance, memory, ache" to a screen reader without crowding the chip.
 */
function Chip<T extends string>({
	option,
	onTap,
}: {
	option: Option<T>;
	onTap: () => void;
}) {
	return (
		<button
			type="button"
			className="chat__chip"
			title={option.hint}
			aria-label={`${option.label} — ${option.hint}`}
			onClick={onTap}
		>
			{option.label}
		</button>
	);
}
