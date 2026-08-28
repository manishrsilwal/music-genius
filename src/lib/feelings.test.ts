import { describe, expect, it } from "vitest";

import type { Preferences } from "./deep-dives";
import {
	CHAT_STEPS,
	heardFromUntrusted,
	heardLabels,
	heardNothing,
	interpretLocally,
	mergeHeard,
} from "./feelings";

const NONE: Preferences = {
	mood: null,
	pull: null,
	familiarity: null,
	languages: null,
};

describe("the scripted spine", () => {
	it("asks the stepper's four questions, languages last", () => {
		// The chat inherits the stepper's rulings: the multi-select exception
		// sits at the end, where finishing it finishes the flow (D-120).
		expect(CHAT_STEPS.map((step) => step.axis)).toEqual([
			"mood",
			"pull",
			"familiarity",
			"languages",
		]);
	});
});

describe("interpretLocally (the offline reader)", () => {
	it("hears 'sad' as heartbroken — the word that started D-121", () => {
		expect(interpretLocally("i am so sad today").mood).toBe("heartbroken");
	});

	it("hears a breakup with a language", () => {
		const heard = interpretLocally("just broke up, something in nepali");
		expect(heard.mood).toBe("heartbroken");
		expect(heard.languages).toEqual(["nepali"]);
	});

	it("collects several languages from one message", () => {
		const heard = interpretLocally("hindi or english is fine");
		expect(heard.languages).toEqual(["english", "hindi"]);
	});

	it("admits hearing nothing rather than guessing", () => {
		// The chat turns this into "I couldn't quite catch that" — a wrong
		// guess would be worse than an honest shrug.
		expect(heardNothing(interpretLocally("qwerty asdf"))).toBe(true);
	});

	it("weighs competing moods by hit count, deterministically", () => {
		const heard = interpretLocally(
			"happy enough, but mostly crying and hurt since the breakup",
		);
		expect(heard.mood).toBe("heartbroken");
	});
});

describe("heardFromUntrusted (the wire's gate)", () => {
	it("keeps only enum values and drops junk", () => {
		const heard = heardFromUntrusted({
			mood: "heartbroken",
			pull: "sabotage",
			familiarity: 42,
			languages: ["nepali", "klingon", "nepali"],
		});
		expect(heard).toEqual({ mood: "heartbroken", languages: ["nepali"] });
	});

	it("never claims 'surprise' — a message cannot clearly imply it", () => {
		expect(heardFromUntrusted({ familiarity: "surprise" })).toEqual({});
	});

	it("shrugs at garbage shapes", () => {
		expect(heardNothing(heardFromUntrusted(null))).toBe(true);
		expect(heardNothing(heardFromUntrusted("nonsense"))).toBe(true);
	});
});

describe("mergeHeard", () => {
	it("spoken axes win, silent axes keep the draft", () => {
		const draft: Preferences = {
			mood: "tender",
			pull: "imagery",
			familiarity: null,
			languages: ["english"],
		};
		const merged = mergeHeard(draft, { mood: "heartbroken" });
		expect(merged).toEqual({
			mood: "heartbroken",
			pull: "imagery",
			familiarity: null,
			languages: ["english"],
		});
	});

	it("a heard language list replaces, not appends", () => {
		// "actually, something in Hindi" is the reader's LATEST word on the
		// axis, not an addition to an answer they are walking back.
		const merged = mergeHeard(
			{ ...NONE, languages: ["english"] },
			{ languages: ["hindi"] },
		);
		expect(merged.languages).toEqual(["hindi"]);
	});
});

describe("heardLabels (the written echo)", () => {
	it("speaks the option lists' own vocabulary", () => {
		expect(
			heardLabels({
				mood: "heartbroken",
				pull: "confession",
				languages: ["nepali"],
			}),
		).toEqual(["heartbroken", "drawn to the honesty", "in Nepali"]);
	});

	it("says nothing about axes that were not heard", () => {
		expect(heardLabels({})).toEqual([]);
	});
});
