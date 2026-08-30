import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import {
	CATALOGUE,
	type CuratedTrack,
	type Era,
	LANGUAGE_OPTIONS,
	type Language,
	MOOD_OPTIONS,
	type Mood,
	matchesMood,
} from "@/lib/deep-dives";
import type { TrackSummary, TrackVisuals } from "@/lib/types";

/**
 * v2 Discover (D-125). Vibe filters over the curated catalogue, plus a
 * plain search that reaches all of LRCLIB. UX cards applied: autocomplete
 * (debounced predictions as the reader types — the results ARE the
 * predictions here, rendered as cards), and no-results is never a dead end
 * (suggestions instead of "0 results").
 */

export const Route = createFileRoute("/v2/")({
	component: Discover,
});

const ERAS: { value: Era; label: string }[] = [
	{ value: "classic", label: "Classics" },
	{ value: "modern", label: "New-ish" },
];

function Discover() {
	const [mood, setMood] = useState<Mood | null>(null);
	const [era, setEra] = useState<Era | null>(null);
	const [language, setLanguage] = useState<Language | null>(null);
	const [query, setQuery] = useState("");
	const [debounced, setDebounced] = useState("");

	// UX card "Search / Autocomplete": debounced fetch, no enter required.
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(query.trim()), 250);
		return () => clearTimeout(timer);
	}, [query]);

	const searching = debounced.length >= 2;
	const search = useQuery({
		queryKey: ["v2-search", debounced],
		enabled: searching,
		queryFn: async ({ signal }): Promise<TrackSummary[]> => {
			const response = await fetch(
				`/api/search?q=${encodeURIComponent(debounced)}`,
				{ signal },
			);
			if (!response.ok) return [];
			return response.json();
		},
	});

	const filtered = useMemo(
		() =>
			CATALOGUE.filter(
				(track) =>
					(!mood || matchesMood(track, mood)) &&
					(!era || track.era === era) &&
					(!language || track.language === language),
			),
		[mood, era, language],
	);

	const moodLabel = (track: CuratedTrack) =>
		MOOD_OPTIONS.find((option) => option.value === track.mood)?.label ??
		track.mood;

	return (
		<main>
			<h1 className="disco__hero">
				What's the <em>vibe?</em>
			</h1>
			<p className="disco__sub">
				Pick a feeling or just type it. Every song opens as lyrics you can
				actually read — and sing wrong less.
			</p>

			<div className="disco__search">
				<input
					className="disco__input"
					type="search"
					value={query}
					placeholder="Search any song or artist…"
					aria-label="Search songs"
					onChange={(event) => setQuery(event.target.value)}
				/>
			</div>

			{!searching && (
				<div className="disco__rows">
					<div className="disco__row">
						<span className="disco__label">Mood</span>
						{MOOD_OPTIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								className="disco__chip"
								aria-pressed={mood === option.value}
								data-on={mood === option.value || undefined}
								onClick={() =>
									setMood(mood === option.value ? null : option.value)
								}
							>
								{option.label}
							</button>
						))}
					</div>
					<div className="disco__row">
						<span className="disco__label">Era</span>
						{ERAS.map((option) => (
							<button
								key={option.value}
								type="button"
								className="disco__chip"
								aria-pressed={era === option.value}
								data-on={era === option.value || undefined}
								onClick={() =>
									setEra(era === option.value ? null : option.value)
								}
							>
								{option.label}
							</button>
						))}
					</div>
					<div className="disco__row">
						<span className="disco__label">Lang</span>
						{LANGUAGE_OPTIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								className="disco__chip"
								aria-pressed={language === option.value}
								data-on={language === option.value || undefined}
								onClick={() =>
									setLanguage(language === option.value ? null : option.value)
								}
							>
								{option.label}
							</button>
						))}
					</div>
				</div>
			)}

			{searching ? (
				(search.data ?? []).length > 0 ? (
					<div className="disco__grid">
						{(search.data ?? []).map((track) => (
							<Card
								key={track.id}
								id={track.id}
								title={track.title}
								artist={track.artist}
							/>
						))}
					</div>
				) : search.isFetching ? (
					<p className="disco__empty">Digging through the crates…</p>
				) : (
					/* UX card "Search / No Results": a way forward, not a wall. */
					<p className="disco__empty">
						Nothing for “{debounced}” — try the artist's name alone, another
						spelling, or clear the search and browse by mood.
					</p>
				)
			) : filtered.length > 0 ? (
				<div className="disco__grid">
					{filtered.map((track) => (
						<Card
							key={track.lrclibId}
							id={track.lrclibId}
							title={track.title}
							artist={track.artist}
							badge={moodLabel(track)}
						/>
					))}
				</div>
			) : (
				<p className="disco__empty">
					Our shelf has nothing with exactly that combo yet — loosen a filter,
					or search: that reaches every song there is.
				</p>
			)}
		</main>
	);
}

function Card({
	id,
	title,
	artist,
	badge,
}: {
	id: string;
	title: string;
	artist: string;
	badge?: string;
}) {
	// Same cache key as v1's shelves, so covers fetched once serve both cuts.
	const { data } = useQuery({
		queryKey: ["artwork", artist.toLowerCase(), title.toLowerCase()],
		queryFn: async ({ signal }): Promise<TrackVisuals> => {
			const response = await fetch(
				`/api/artwork?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
				{ signal },
			);
			if (!response.ok) return { artwork: null, palette: null };
			return response.json();
		},
		staleTime: Number.POSITIVE_INFINITY,
	});

	return (
		<Link
			to="/v2/track/$trackId"
			params={{ trackId: id }}
			className="disco__card"
		>
			<span className="disco__art">
				{data?.artwork && (
					<img
						src={data.artwork.thumbnail}
						alt=""
						loading="lazy"
						decoding="async"
					/>
				)}
			</span>
			<span className="disco__title">{title}</span>
			<span className="disco__artist">{artist}</span>
			{badge && <span className="disco__badge">{badge}</span>}
		</Link>
	);
}
