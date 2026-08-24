import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { isVariant } from "@/lib/ranking";
import type { TrackSummary } from "@/lib/types";

import "./track-versions.scss";

/**
 * Other recordings of this song (OD-028).
 *
 * LRCLIB holds uploads, and several of them are usually different
 * performances rather than different copies of one: a LoFi edit, a live cut, a
 * cover, the original. Ranking now puts the likeliest first, but "likeliest"
 * is not "right" — someone may have come for the Sanam version, and for a song
 * like "Lag Ja Gale" the only upload filed under that exact title is a LoFi
 * one, because the original is filed under its full name, "Lag Ja Gale Se
 * Phir". No amount of ranking finds a record that is not in the result set.
 *
 * So the last word goes to the reader. This is the honest response to a
 * user-contributed catalogue: show that other readings exist and let them
 * choose, rather than picking one and hoping.
 *
 * It matters more here than a version list normally would, because an LRC
 * file's timings belong to its own recording. Landing on the wrong one does
 * not merely play the wrong take — it makes the lyrics scroll against it.
 */
export function TrackVersions({
	trackId,
	title,
	artist,
}: {
	trackId: string;
	title: string;
	artist: string;
}) {
	const { data } = useQuery({
		queryKey: ["versions", title.toLowerCase(), artist.toLowerCase()],
		queryFn: async ({ signal }): Promise<TrackSummary[]> => {
			const response = await fetch(
				`/api/search?q=${encodeURIComponent(`${title} ${artist}`)}`,
				{ signal },
			);
			if (!response.ok) return [];
			return response.json();
		},
		staleTime: 5 * 60_000,
	});

	// Never offer the page the reader is already on.
	const others = (data ?? []).filter((item) => item.id !== trackId).slice(0, 4);
	if (others.length === 0) return null;

	return (
		<section className="versions">
			<h2 className="versions__label">Other recordings of this song</h2>
			<p className="versions__note">
				Lyrics are contributed per upload, so the timings follow whichever
				recording they were made from.
			</p>
			<ul className="versions__list">
				{others.map((item) => (
					<li key={item.id}>
						<Link
							to="/track/$trackId"
							params={{ trackId: item.id }}
							className="versions__row"
						>
							<span className="versions__title">{item.title}</span>
							<span className="versions__artist">{item.artist}</span>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}

/**
 * Says so when the reader is on a variant, rather than letting them work it
 * out from lyrics that will not line up.
 */
export function VariantNotice({ title }: { title: string }) {
	if (!isVariant(title)) return null;

	return (
		<p className="versions__variant">
			This is an alternate recording — its timings follow this version, not the
			original.
		</p>
	);
}
