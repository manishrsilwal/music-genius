import { describe, expect, it } from "vitest";

import { formatTime } from "./seekbar";

/**
 * The player reports 0 until it is ready and can report NaN between states,
 * so the guards here are the difference between a clock and "NaN:aN" sitting
 * in the bar (D-040).
 */
describe("formatTime", () => {
	it("formats under a minute", () => {
		expect(formatTime(0)).toBe("0:00");
		expect(formatTime(7)).toBe("0:07");
		expect(formatTime(59)).toBe("0:59");
	});

	it("formats minutes and seconds", () => {
		expect(formatTime(60)).toBe("1:00");
		expect(formatTime(255)).toBe("4:15");
		expect(formatTime(3599)).toBe("59:59");
	});

	it("adds an hours field only past an hour", () => {
		expect(formatTime(3600)).toBe("1:00:00");
		expect(formatTime(3661)).toBe("1:01:01");
	});

	it("truncates rather than rounds, so the clock never runs ahead", () => {
		expect(formatTime(59.9)).toBe("0:59");
	});

	it("never renders NaN or a negative clock", () => {
		expect(formatTime(Number.NaN)).toBe("0:00");
		expect(formatTime(Number.POSITIVE_INFINITY)).toBe("0:00");
		expect(formatTime(-5)).toBe("0:00");
	});
});
