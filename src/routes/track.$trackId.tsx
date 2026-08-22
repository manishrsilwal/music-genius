import {
	Await,
	createFileRoute,
	defer,
	Link,
	notFound,
} from "@tanstack/react-router";
import { useState } from "react";
import { RouteError } from "@/components/route-error";
import { RouteMessage } from "@/components/route-message";
import { InsightsAffordance } from "@/features/insights/components/insights-affordance";
import { CardAffordance } from "@/features/lyric-card/components/card-affordance";
import { PlaybackBar } from "@/features/playback/components/playback-bar";
import { LyricCanvas } from "@/features/scrollytelling/components/lyric-canvas";
import { PaletteStyle } from "@/features/scrollytelling/components/palette-style";
import { TrackHero } from "@/features/scrollytelling/components/track-hero";
import type { LinePosition } from "@/lib/lrc";
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
		<RouteMessage
			kicker="Not found"
			title="Not in the library"
			body="LRCLIB has no lyrics for that track yet."
			action={{ to: "/", label: "Search again" }}
		/>
	),
	/**
	 * The track route reaches two services that are outside our control, so
	 * this is the boundary most likely to be used (D-041).
	 */
	errorComponent: RouteError,
});

function TrackPage() {
	const { track, visuals } = Route.useLoaderData();
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [syncPosition, setSyncPosition] = useState<LinePosition | null>(null);

	return (
		<article
			className="track-shell"
			data-track-scope={track.id}
			data-drawer={drawerOpen ? "open" : "closed"}
		>
			{/* Mounts alongside once the palette resolves, repainting every accent
			    utility at once without disturbing anything already on screen. */}
			<Await promise={visuals} fallback={null}>
				{({ palette }) => <PaletteStyle palette={palette} scope={track.id} />}
			</Await>

			{/*
			  Playback (PRD §3.2). Placed inside the hero so it opens as part of
			  the composition and docks to a full-width bar once the reader
			  scrolls past it (D-038). Passed as a node rather than built by the
			  hero, which has no business knowing about sync.
			*/}
			<TrackHero
				track={track}
				visuals={visuals}
				player={
					<Await promise={visuals} fallback={null}>
						{({ youtubeId, artwork }) =>
							youtubeId ? (
								<PlaybackBar
									videoId={youtubeId}
									title={track.title}
									artist={track.artist}
									artwork={artwork?.thumbnail ?? null}
									stanzas={track.stanzas}
									synced={track.synced}
									onSyncChange={setSyncPosition}
								/>
							) : null
						}
					</Await>
				}
			/>
			<LyricCanvas stanzas={track.stanzas} syncPosition={syncPosition} />

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

			<InsightsAffordance trackId={track.id} onOpenChange={setDrawerOpen} />

			<footer className="track-shell__foot text-center">
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
