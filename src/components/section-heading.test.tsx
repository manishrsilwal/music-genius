// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionHeading } from "./section-heading";

/**
 * The first component test in the repo (OD-020 → D-077), and the component is
 * chosen deliberately: `SectionHeading` is the one piece of markup shared by
 * the landing and the story drawer, so a regression in it breaks the section
 * structure of both surfaces at once.
 *
 * What is worth asserting here is SEMANTICS, not styling — the DOM contract
 * that assistive technology and the CSS both depend on.
 */
describe("SectionHeading", () => {
	it("renders the label as a real heading", () => {
		render(<SectionHeading>Deep Dives</SectionHeading>);
		expect(
			screen.getByRole("heading", { name: "Deep Dives" }),
		).toBeInTheDocument();
	});

	it("keeps the lead out of the heading's accessible name", () => {
		// The lead explains the section; it must not bloat what a screen
		// reader announces when navigating by headings.
		render(
			<SectionHeading lead="Three from a catalogue we chose by hand.">
				Deep Dives
			</SectionHeading>,
		);
		const heading = screen.getByRole("heading");
		expect(heading).toHaveAccessibleName("Deep Dives");
		expect(screen.getByText(/catalogue we chose/)).toBeInTheDocument();
	});

	it("renders an action beside the label, not inside it", () => {
		render(
			<SectionHeading action={<button type="button">Clear</button>}>
				Continue reading
			</SectionHeading>,
		);
		const heading = screen.getByRole("heading", { name: "Continue reading" });
		const action = screen.getByRole("button", { name: "Clear" });
		expect(heading.contains(action)).toBe(false);
	});

	it("carries an id through for anchoring", () => {
		render(<SectionHeading id="sources">The Sources</SectionHeading>);
		expect(
			screen.getByRole("heading", { name: "The Sources" }),
		).toHaveAttribute("id", "sources");
	});
});
