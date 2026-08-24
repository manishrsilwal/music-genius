import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { SectionHeading } from "@/components/section-heading";
import type { HistoryEntry } from "@/lib/history";
import { riseVariants, staggerVariants } from "@/lib/motion";
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
	onRemove,
	onClear,
}: {
	entries: HistoryEntry[];
	onRemove: (id: string) => void;
	onClear: () => void;
}) {
	if (entries.length === 0) return null;

	return (
		<section>
			<SectionHeading
				action={
					<button
						type="button"
						onClick={onClear}
						className="tap text-micro uppercase tracking-label text-ink-faint hover:text-ink"
					>
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
							to="/track/$trackId"
							params={{ trackId: entry.id }}
							className="recent__link"
						>
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
