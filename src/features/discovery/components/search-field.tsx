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
	const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
		signal,
	});
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
export function SearchField() {
	const [term, setTerm] = useState("");
	const [highlighted, setHighlighted] = useState(0);
	const navigate = useNavigate();
	const listId = useId();
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
	const isOpen = enabled && results.length > 0;

	const open = (track: TrackSummary) => {
		navigate({ to: "/track/$trackId", params: { trackId: track.id } });
	};

	const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (!isOpen) return;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setHighlighted((i) => (i + 1) % results.length);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setHighlighted((i) => (i - 1 + results.length) % results.length);
		} else if (event.key === "Enter") {
			const choice = results[highlighted];
			if (choice) open(choice);
		} else if (event.key === "Escape") {
			setTerm("");
		}
	};

	return (
		<div className="search">
			<input
				type="search"
				role="combobox"
				value={term}
				onChange={(event) => {
					setTerm(event.target.value);
					setHighlighted(0);
				}}
				onKeyDown={onKeyDown}
				placeholder="Search a song or an artist"
				aria-label="Search lyrics"
				aria-expanded={isOpen}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={isOpen ? optionId(highlighted) : undefined}
				autoComplete="off"
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
						{results.map((track, index) => (
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
						))}
					</motion.ul>
				)}
			</AnimatePresence>
		</div>
	);
}
