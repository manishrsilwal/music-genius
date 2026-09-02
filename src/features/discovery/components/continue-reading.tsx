import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { SectionHeading } from "@/components/section-heading";
import type { HistoryEntry } from "@/lib/history";
import { riseVariants, staggerVariants } from "@/lib/motion";
import { DiveArt } from "./deep-dives";
import "./continue-reading.scss";

/**
 * Continue reading (D-056).
 *
 * The one shelf that makes a second visit different from a first. Everything
 * else on this page is the same for every reader on every day; this is theirs.
 *
 * Renders nothing at all when there is no history, so a first visit is exactly
 * as it was — an empty shelf explaining what would eventually appear here is
 * chrome charging rent for a feature the reader has not used yet.
 */
export function ContinueReading({
	entries,
	trackTo = "/track/$trackId",
	onRemove,
	onClear,
}: {
	entries: HistoryEntry[];
	onRemove: (id: string) => void;
	onClear: () => void;
	trackTo?: "/track/$trackId" | "/v2/track/$trackId";
}) {
	if (entries.length === 0) return null;

	return (
		<section>
			<SectionHeading
				action={
					<button
						type="button"
						onClick={onClear}
						className="recent__clear tap text-micro uppercase tracking-label text-ink-faint hover:text-ink"
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
								d="M2 3.5h10M5.5 3.5V2.2h3v1.3M3.5 3.5l.55 7.6a1 1 0 0 0 1 .9h3.9a1 1 0 0 0 1-.9l.55-7.6"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
							<path
								d="M5.75 6v3.5M8.25 6v3.5"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
							/>
						</svg>
						Clear
					</button>
				}
			>
				Continue reading
			</SectionHeading>

			<motion.ul
				className="recent"
				variants={staggerVariants}
				initial="hidden"
				animate="visible"
			>
				{entries.map((entry) => (
					<motion.li
						key={entry.id}
						variants={riseVariants}
						className="recent__row"
					>
						<Link
							to={trackTo}
							params={{ trackId: entry.id }}
							className="recent__link"
						>
							{/* The cover anchors the row, the same grammar as the
							    also shelf (D-101/D-102). */}
							<span className="recent__art">
								<DiveArt title={entry.title} artist={entry.artist} />
							</span>
							<span className="recent__title text-caption">{entry.title}</span>
							<span className="recent__artist text-micro">{entry.artist}</span>
						</Link>

						{/*
						  Per-row removal, not just a bulk clear. What someone has
						  read is personal, and taking one thing off the shelf
						  should not cost them the rest of it.
						*/}
						<button
							type="button"
							onClick={() => onRemove(entry.id)}
							aria-label={`Remove ${entry.title} from continue reading`}
							className="recent__remove"
						>
							<svg
								viewBox="0 0 16 16"
								// Intrinsic size, not just CSS: an SVG without one lays out
								// at the default 300x150 until the stylesheet resolves it.
								width="12"
								height="12"
								aria-hidden="true"
								focusable="false"
							>
								<path
									d="M4 4l8 8M12 4l-8 8"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									fill="none"
								/>
							</svg>
						</button>
					</motion.li>
				))}
			</motion.ul>
		</section>
	);
}
