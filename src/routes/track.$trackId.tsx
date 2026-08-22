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
import {
	getSiteOriginFn,
	getTrackFn,
	getTrackVisualsFn,
} from "@/server/lyrics.functions";

export const Route = createFileRoute("/track/$trackId")({
	// Calls the server functions directly. The loader is isomorphic, so it must
	// never fetch /api/track — see src/server/lyrics.server.ts.
	loader: async ({ params }) => {
		// In parallel: neither waits on the other, and during SSR — the only
		// time a crawler is watching — both resolve as direct calls.
		const [track, origin] = await Promise.all([
			getTrackFn({ data: { id: params.trackId } }),
			getSiteOriginFn(),
		]);
		if (!track) throw notFound();

		// Deliberately NOT awaited (D-017). Artwork costs a Genius round-trip
		// plus an image fetch and decode; the words ship without waiting and
		// the visuals stream in behind them.
		// defer() marks the promise so SSR does not await it before flushing.
		// Without it the server blocks on artwork and the whole point is lost.
		const visuals = defer(
			getTrackVisualsFn({ data: { title: track.title, artist: track.artist } }),
		);

		return { track, visuals, origin };
	},
	head: ({ loaderData, params }) => {
		if (!loaderData) return { meta: [{ title: "Track not found" }] };

		const { title, artist } = loaderData.track;
		const heading = `${title} — ${artist}`;
		const description = `Read the lyrics to ${title} by ${artist}.`;

		return {
			meta: [
				{ title: heading },
				{ name: "description", content: description },
				/*
				 * Per-track social card (D-051). The image is the Lyric Card
				 * renderer the product already ships, so a shared link previews
				 * as the same object a reader would export — rather than as a
				 * bare URL, which is a poor argument for a product whose claim
				 * is that lyrics deserve to be set properly.
				 */
				{ property: "og:type", content: "article" },
				{ property: "og:title", content: heading },
				{ property: "og:description", content: description },
				{
					property: "og:image",
					// Absolute when SITE_URL is configured. Open Graph requires a
					// full URL and crawlers drop a relative one rather than
					// resolving it against the page — so this is the difference
					// between a card and no card, not a tidiness point.
					content: `${loaderData.origin}/api/og?trackId=${encodeURIComponent(params.trackId)}`,
				},
				// Square, because the card is square (CARD_SIZE). Declaring the
				// real dimensions stops crawlers guessing and letterboxing it.
				{ property: "og:image:width", content: "1080" },
				{ property: "og:image:height", content: "1080" },
				{ property: "og:image:alt", content: `A lyric card for ${heading}` },
				{ name: "twitter:card", content: "summary_large_image" },
			],
		};
	},
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
			id="main"
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
