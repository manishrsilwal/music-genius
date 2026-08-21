import {
	Await,
	createFileRoute,
	defer,
	Link,
	notFound,
} from "@tanstack/react-router";

import { CardAffordance } from "@/features/lyric-card/components/card-affordance";
import { LyricCanvas } from "@/features/scrollytelling/components/lyric-canvas";
import { PaletteStyle } from "@/features/scrollytelling/components/palette-style";
import { TrackHero } from "@/features/scrollytelling/components/track-hero";
import { getTrackFn, getTrackVisualsFn } from "@/server/lyrics.functions";

export const Route = createFileRoute("/track/$trackId")({
	// Calls the server functions directly. The loader is isomorphic, so it must
	// never fetch /api/track — see src/server/lyrics.server.ts.
	loader: async ({ params }) => {
		const track = await getTrackFn({ data: { id: params.trackId } });
		if (!track) throw notFound();

		// Deliberately NOT awaited (D-017). Artwork costs a Genius round-trip
		// plus an image fetch and decode; the words ship without waiting and
		// the visuals stream in behind them.
		// defer() marks the promise so SSR does not await it before flushing.
		// Without it the server blocks on artwork and the whole point is lost.
		const visuals = defer(
			getTrackVisualsFn({ data: { title: track.title, artist: track.artist } }),
		);

		return { track, visuals };
	},
	head: ({ loaderData }) =>
		loaderData
			? {
					meta: [
						{ title: `${loaderData.track.title} — ${loaderData.track.artist}` },
						{
							name: "description",
							content: `Read the lyrics to ${loaderData.track.title} by ${loaderData.track.artist}.`,
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
	const { track, visuals } = Route.useLoaderData();

	return (
		<article data-track-scope={track.id}>
			{/* Mounts alongside once the palette resolves, repainting every accent
			    utility at once without disturbing anything already on screen. */}
			<Await promise={visuals} fallback={null}>
				{({ palette }) => <PaletteStyle palette={palette} scope={track.id} />}
			</Await>

			<TrackHero track={track} visuals={visuals} />
			<LyricCanvas stanzas={track.stanzas} />

			{/* Selection → card (PRD §3.4). The palette streams in with the
			    artwork, so card treatments pick up the track's hue once it lands. */}
			<Await
				promise={visuals}
				fallback={
					<CardAffordance
						title={track.title}
						artist={track.artist}
						palette={null}
					/>
				}
			>
				{({ palette }) => (
					<CardAffordance
						title={track.title}
						artist={track.artist}
						palette={palette}
					/>
				)}
			</Await>

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
