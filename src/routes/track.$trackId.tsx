import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { LyricCanvas } from "@/features/scrollytelling/components/lyric-canvas";
import { TrackHero } from "@/features/scrollytelling/components/track-hero";
import { paletteStyle } from "@/lib/palette-style";
import { getTrackFn } from "@/server/lyrics.functions";

export const Route = createFileRoute("/track/$trackId")({
	// Calls the server function directly. The loader is isomorphic, so it must
	// never fetch /api/track — see src/server/lyrics.server.ts.
	loader: async ({ params }) => {
		const track = await getTrackFn({ data: { id: params.trackId } });
		if (!track) throw notFound();
		return track;
	},
	head: ({ loaderData }) =>
		loaderData
			? {
					meta: [
						{ title: `${loaderData.title} — ${loaderData.artist}` },
						{
							name: "description",
							content: `Read the lyrics to ${loaderData.title} by ${loaderData.artist}.`,
						},
					],
				}
			: { meta: [{ title: "Track not found" }] },
	component: TrackPage,
	notFoundComponent: () => (
		<main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 text-center">
			<h1 className="font-display text-display text-ink">Not in the library</h1>
			<p className="mt-4 text-lead text-ink-muted">
				LRCLIB has no lyrics for that track yet.
			</p>
			<Link
				to="/"
				className="mt-8 text-caption uppercase tracking-label text-accent"
			>
				Search again
			</Link>
		</main>
	),
});

function TrackPage() {
	const track = Route.useLoaderData();

	return (
		// The palette is applied once, at the top of the subtree. Everything
		// beneath inherits the track's accent through CSS custom properties.
		<article
			style={paletteStyle(track.palette)}
			data-track-theme={track.palette ? "" : undefined}
		>
			<TrackHero track={track} />
			<LyricCanvas stanzas={track.stanzas} />

			<footer className="pb-32 text-center">
				<Link
					to="/"
					className="text-caption uppercase tracking-label text-accent"
				>
					Search another
				</Link>
			</footer>
		</article>
	);
}
