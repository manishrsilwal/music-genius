import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";

import { riseVariants, transition } from "@/lib/motion";
import type { TrackSummary } from "@/lib/types";

import { useDebounced } from "../hooks/use-debounced";
import { ResultThumb } from "./result-thumb";
import "./search-field.scss";

/** Runs in the browser only, so a relative URL is safe here. */
async function search(
	query: string,
	signal?: AbortSignal,
): Promise<TrackSummary[]> {
	const response = await fetch(
		`/api/search?q=${encodeURIComponent(query)}&limit=20`,
		{
			signal,
		},
	);
	if (!response.ok) throw new Error("Search is unavailable right now");
	return response.json();
}

function formatDuration(seconds: number | null): string {
	if (seconds == null) return "";
	const minutes = Math.floor(seconds / 60);
	return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

/**
 * Instant autocomplete (PRD §3.1).
 *
 * Album-art thumbnails are specified but need the Genius API, which is blocked
 * on OD-005. Rows are typographic until that resolves.
 */
export function SearchField({
	hideLabel = false,
	autoFocus = false,
	onSelect,
	trackTo = "/track/$trackId",
}: {
	/**
	 * Visually hide the label (D-103). For contexts where a heading directly
	 * above already says "Search for a song" — the explorer's title does —
	 * and repeating it as a label is the same words twice on one screen. The
	 * label element stays: it is the field's accessible name.
	 */
	hideLabel?: boolean;
	/**
	 * Focus the field on mount (D-103). Only for the page whose single
	 * feature IS the search — anywhere else, stealing focus is rude.
	 */
	autoFocus?: boolean;
	/**
	 * Claim the selection instead of navigating (D-115). The listen party
	 * queues the chosen track in place; everywhere else, choosing a song IS
	 * going to it, so navigation stays the default.
	 */
	onSelect?: (track: TrackSummary) => void;
	/** Which track route a chosen song opens — v2 passes its own (D-126). */
	trackTo?: "/track/$trackId" | "/v2/track/$trackId";
} = {}) {
	const [term, setTerm] = useState("");
	const [highlighted, setHighlighted] = useState(0);
	const navigate = useNavigate();
	const listId = useId();
	const inputId = useId();
	const optionId = (index: number) => `${listId}-option-${index}`;

	const debounced = useDebounced(term);
	const enabled = debounced.trim().length >= 2;

	const { data, isFetching, error } = useQuery({
		queryKey: ["search", debounced],
		queryFn: ({ signal }) => search(debounced, signal),
		enabled,
		staleTime: 60_000,
	});

	const results = data ?? [];
	/*
	 * The panel opens whenever there is something to say, which now includes
	 * having nothing to show (D-056). It used to open only on results, so a
	 * query that matched nothing produced silence — no message, no sign the
	 * search had even run. A reader cannot tell a miss from a broken field.
	 */
	const settled = enabled && !isFetching && !error;
	const empty = settled && results.length === 0;
	const isOpen = (enabled && results.length > 0) || empty;

	const open = (track: TrackSummary) => {
		if (onSelect) {
			// The field resets so the next add starts clean — the party's
			// queue is built in bursts, not one navigation at a time.
			setTerm("");
			onSelect(track);
			return;
		}
		navigate({ to: trackTo, params: { trackId: track.id } });
	};

	const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		// Guards on rows, not on the panel. Since D-056 the panel also opens to
		// say there is nothing — and arrowing through zero results computes
		// `% 0`, which is NaN, and points `aria-activedescendant` at a row that
		// does not exist. Escape still has to work, so it is handled first.
		if (event.key === "Escape") {
			setTerm("");
			return;
		}
		if (results.length === 0) return;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setHighlighted((i) => (i + 1) % results.length);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setHighlighted((i) => (i - 1 + results.length) % results.length);
		} else if (event.key === "Enter") {
			const choice = results[highlighted];
			if (choice) open(choice);
		}
	};

	return (
		<div className="search">
			{/*
			  A visible label, not a placeholder standing in for one (D-060).
			  The field previously carried a placeholder plus an aria-label,
			  which leaves a sighted reader with nothing once they start typing
			  — the placeholder disappears exactly when the reminder of what the
			  field is for becomes useful.

			  It is also the accessible name now, so the text has to read
			  sensibly out of context: "Search for a song" does, where the
			  section framing it answers ("Know the song?") would not.
			*/}
			<label
				htmlFor={inputId}
				className={
					hideLabel
						? "sr-only"
						: "mb-2 block text-micro uppercase tracking-label text-ink-faint"
				}
			>
				Search for a song
			</label>

			{/*
			  "any" names the reach. The shelves are 59 tracks chosen by hand;
			  this field is everything LRCLIB holds, and nothing on the page
			  said so (D-056).
			*/}
			<input
				id={inputId}
				type="search"
				role="combobox"
				value={term}
				onChange={(event) => {
					setTerm(event.target.value);
					setHighlighted(0);
				}}
				onKeyDown={onKeyDown}
				placeholder="Search any song or artist"
				aria-expanded={isOpen}
				aria-controls={listId}
				aria-autocomplete="list"
				// Only when a row actually exists to point at (D-056).
				aria-activedescendant={
					results.length > 0 ? optionId(highlighted) : undefined
				}
				autoComplete="off"
				// biome-ignore lint/a11y/noAutofocus: opt-in, only on the search-only page (D-103)
				autoFocus={autoFocus}
				className="search__input px-5 py-4 text-lead"
			/>

			{/*
			  A status region, not decoration (D-053). The combobox itself is
			  fully described, but "searching" and "search is unavailable" are
			  state changes with no focus event behind them — unannounced, a
			  screen reader user waits on a result that is never coming.

			  `<output>` rather than a <p role="status">: it carries the status
			  role natively, so the semantics survive anyone later editing the
			  attributes off. `display: block` because <output> is inline and
			  the reserved height would otherwise collapse.
			*/}
			<output
				aria-live="polite"
				className="mt-3 block h-5 text-micro uppercase tracking-label text-ink-faint"
			>
				{error
					? "Search is unavailable right now"
					: isFetching
						? "Searching…"
						: ""}
			</output>

			<AnimatePresence>
				{isOpen && (
					<motion.ul
						id={listId}
						role="listbox"
						className="search__results"
						variants={riseVariants}
						initial="hidden"
						animate="visible"
						exit="hidden"
						transition={transition.quick}
					>
						{empty ? (
							<li className="search__empty px-5 py-5">
								<p className="text-caption text-ink">
									Nothing matching “{debounced.trim()}”
								</p>
								<p className="mt-1 text-micro text-ink-faint">
									{/*
									  Names the likeliest cause rather than
									  apologising. LRCLIB is user-contributed, so a
									  miss is usually a spelling or an upload nobody
									  has made — not a fault the reader can see.
									*/}
									Lyrics here are contributed by listeners, so a song can be
									missing entirely. Try the artist’s name, or fewer words.
								</p>
							</li>
						) : (
							results.map((track, index) => (
								<li key={track.id} role="none">
									<button
										type="button"
										id={optionId(index)}
										role="option"
										aria-selected={index === highlighted}
										data-highlighted={index === highlighted}
										onMouseEnter={() => setHighlighted(index)}
										onClick={() => open(track)}
										className="search__option px-5 py-4"
									>
										<ResultThumb title={track.title} artist={track.artist} />

										<span className="search__meta">
											<span className="search__title text-lead text-ink">
												{track.title}
											</span>
											<span className="search__artist text-caption text-ink-muted">
												{track.artist}
											</span>
										</span>

										<span className="ml-auto shrink-0 text-micro text-ink-faint">
											{track.hasSyncedLyrics ? "Synced" : ""}{" "}
											{formatDuration(track.duration)}
										</span>
									</button>
								</li>
							))
						)}
					</motion.ul>
				)}
			</AnimatePresence>
		</div>
	);
}
