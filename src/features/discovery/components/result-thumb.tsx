import { useQuery } from "@tanstack/react-query";

import type { TrackVisuals } from "@/lib/types";

/**
 * Autocomplete thumbnail (PRD §3.1).
 *
 * Fetched per row rather than bundled into the search response: resolving
 * artwork for eight results inline cost ~2s on every novel query, which is the
 * opposite of instant (D-017). Rows render immediately and fill in.
 *
 * Keyed on artist and title, so TanStack Query dedupes the same recording
 * across every search that surfaces it — and the server caches it for 30 days
 * beyond that.
 */
async function fetchVisuals(
	title: string,
	artist: string,
	signal?: AbortSignal,
): Promise<TrackVisuals> {
	const query = `title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
	const response = await fetch(`/api/artwork?${query}`, { signal });
	if (!response.ok) return { artwork: null, palette: null, youtubeId: null };
	return response.json();
}

export function ResultThumb({
	title,
	artist,
}: {
	title: string;
	artist: string;
}) {
	const { data } = useQuery({
		queryKey: ["artwork", artist.toLowerCase(), title.toLowerCase()],
		queryFn: ({ signal }) => fetchVisuals(title, artist, signal),
		staleTime: Number.POSITIVE_INFINITY,
	});

	return (
		// Fixed box, always rendered: the row must not reflow when art arrives.
		<span className="search__thumb">
			{data?.artwork && (
				<img
					src={data.artwork.thumbnail}
					alt=""
					loading="lazy"
					decoding="async"
				/>
			)}
		</span>
	);
}
