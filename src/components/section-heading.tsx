import type { ReactNode } from "react";

import "./section-heading.scss";

/**
 * How a section announces itself (D-069).
 *
 * Written once and used on both the landing and inside the story drawer,
 * because the complaint was the same in both places: it is hard to see where
 * one section ends and the next begins.
 *
 * The cause was a flat hierarchy. Every section label in the product was set
 * identically — `text-micro`, uppercase, faint — so five sections on the
 * landing produced five interchangeable grey lines and the page read as one
 * continuous column. There was nothing to scan by.
 *
 * Three devices, all quiet, because two of these surfaces are for reading:
 *
 *   - A hairline ABOVE the label. The oldest editorial way of saying "a new
 *     thing starts here", and the cheapest — it adds no colour and no box.
 *   - The label steps up to full ink at weight 600. It was the same faint
 *     grey as the helper text underneath it, which is what made a heading
 *     read as chrome.
 *   - Asymmetric space: a lot above the rule, a little between the label and
 *     what it introduces. Proximity then groups the label with its own
 *     content instead of leaving it floating equidistant between two
 *     sections, which is what the old uniform gap did.
 */
export function SectionHeading({
	children,
	lead,
	action,
	id,
}: {
	/** The label itself. Short — it is a signpost, not a sentence. */
	children: ReactNode;
	/** The line under it that says what the section is. Optional. */
	lead?: ReactNode;
	/** A control belonging to the section, set on the label's own line. */
	action?: ReactNode;
	id?: string;
}) {
	return (
		<div className="section-heading">
			<div className="section-heading__bar">
				<h2 className="section-heading__label" id={id}>
					{children}
				</h2>
				{action}
			</div>
			{lead && <p className="section-heading__lead">{lead}</p>}
		</div>
	);
}
