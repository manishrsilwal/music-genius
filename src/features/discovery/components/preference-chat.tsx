import { Link } from "@tanstack/react-router";
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
 * Anatomy after the owner's layout review: the tile is a MESSENGER, not a
 * form — a named header, quick-reply chips that live inside the thread
 * under the question they answer, a typing indicator while the AI reads,
 * and a round send. The two ways OUT of the conversation (skip-to-search,
 * the party) are doorways BELOW the tile, not controls inside it: leaving
 * the chat should not look like part of the chat.
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

/**
 * One opening bubble, not a greeting plus a question (owner's report: the
 * chat pushed its own skip and the page's party doorway below the fold —
 * D-028's lesson, relearned in chat clothes). Every bubble the first view
 * does not need is fold the reader loses.
 */
const OPENING = `Tell me how you're feeling — in your own words, or a tap at a time. ${CHAT_STEPS[0].question}`;

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
		{ id: 0, from: "bot", text: OPENING },
	]);
	const nextId = useRef(1);

	/* The reader's own languages first (D-120), read once (stable list). */
	const [languageOptions] = useState(() =>
		orderLanguagesByLocale(
			typeof navigator === "undefined" ? [] : navigator.languages,
		),
	);

	const endRef = useRef<HTMLDivElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll follows the whole exchange — bubbles, the typing dots, and each step's fresh chips
	useEffect(() => {
		endRef.current?.scrollIntoView({
			behavior: reduce ? "auto" : "smooth",
			block: "nearest",
		});
	}, [bubbles, busy, stage]);

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
			<div className="chat__tile">
				{/*
				  A conversation has a counterpart — but the counterpart is the
				  product, and the masthead already says its name (owner's
				  review: a repeated brand crowds a small tile, and a second
				  three-bar mark read as a second hamburger menu that opens
				  nothing). So: ONE role line, and an avatar of the brand's own
				  idea — a musical repeat sign, the line that returns.
				*/}
				<header className="chat__head">
					<span className="chat__avatar" aria-hidden="true">
						<svg
							viewBox="0 0 14 14"
							width="14"
							height="14"
							aria-hidden="true"
							focusable="false"
						>
							<circle cx="3.6" cy="4.9" r="1.15" />
							<circle cx="3.6" cy="9.1" r="1.15" />
							<rect x="7.2" y="2" width="1.4" height="10" rx="0.7" />
							<rect
								x="10.2"
								y="2"
								width="2.4"
								height="10"
								rx="0.9"
								className="chat__avatar-accent"
							/>
						</svg>
					</span>
					<p className="chat__role">Turns feelings into songs</p>
				</header>

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
						<p className="chat__bubble chat__bubble--typing" data-from="bot">
							{/* The words for ears, the dots for eyes: a paragraph
							    cannot carry aria-label, and the live region reads
							    this text aloud the way sighted readers read the
							    dots. */}
							<span className="sr-only">Reading that…</span>
							<span className="chat__dot" aria-hidden="true" />
							<span className="chat__dot" aria-hidden="true" />
							<span className="chat__dot" aria-hidden="true" />
						</p>
					)}

					{/*
					  Quick replies live IN the thread, under the question they
					  answer — a separate chip band below the conversation read
					  as a form bolted to a chat (owner's review). They scroll
					  with the exchange, the way replies do everywhere else the
					  reader chats.
					*/}
					{!busy && (
						<div className="chat__replies">
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
										const selected = (draft.languages ?? []).includes(
											option.value,
										);
										return (
											<button
												key={option.value}
												type="button"
												className="chat__chip"
												aria-pressed={selected}
												data-selected={selected || undefined}
												onClick={() => toggleLanguage(option.value)}
											>
												{/* Always in the layout, grey until chosen:
												    an appearing mark would shift the label
												    under the finger that pressed it. */}
												<Tick className="chat__tick" />
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
									<button
										type="button"
										className="chat__chip"
										onClick={rejectHeard}
									>
										Not quite — let me choose
									</button>
								</>
							)}
						</div>
					)}
					<div ref={endRef} />
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
					{/* Round, iconic, at the line's end: the send everyone's
					    thumb already knows. A wide SEND pill read as a search
					    button (owner's review). */}
					<button
						type="submit"
						className="chat__send"
						aria-label="Send"
						disabled={busy || text.trim().length === 0}
					>
						<svg
							viewBox="0 0 14 14"
							width="15"
							height="15"
							aria-hidden="true"
							focusable="false"
						>
							<path
								d="M7 11.5 V2.5 M3.2 6 L7 2.2 L10.8 6"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</button>
				</form>

				{/* The privacy split, said where it applies — beside the one
				    control that crosses the wire. */}
				<p className="chat__privacy text-micro">
					Taps stay on this device. Typed words are sent once to be understood,
					and not kept.
				</p>
			</div>

			{/*
			  The ways OUT of the conversation, below the surface they leave
			  (owner's layout review — leaving the chat should not look like
			  part of the chat). Two peer doorways: the search (D-064's one
			  full escape, unchanged in rank) and the party (D-115's doorway,
			  moved up from the page's end where the chat had pushed it out
			  of the first view).
			*/}
			<div className="chat__doors">
				<button
					type="button"
					className="chat__door"
					onClick={() => onComplete(draft)}
				>
					Skip all — just let me search
				</button>
				<Link to="/party" className="chat__door">
					Listen together — start a party
				</Link>
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
