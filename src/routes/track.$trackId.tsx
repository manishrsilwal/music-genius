import {
	Await,
	createFileRoute,
	defer,
	Link,
	notFound,
} from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { RouteError } from "@/components/route-error";
import { RouteMessage } from "@/components/route-message";
import { ReadNext } from "@/features/discovery/components/read-next";
import {
	TrackVersions,
	VariantNotice,
} from "@/features/discovery/components/track-versions";
import { useRecordVisit } from "@/features/discovery/hooks/use-history";
import {
	DiscoverButton,
	InsightsDrawer,
} from "@/features/insights/components/insights-drawer";
import { useInsights } from "@/features/insights/hooks/use-insights";
import { CardAffordance } from "@/features/lyric-card/components/card-affordance";
import { PlaybackBar } from "@/features/playback/components/playback-bar";
import { LyricCanvas } from "@/features/scrollytelling/components/lyric-canvas";
import { PaletteStyle } from "@/features/scrollytelling/components/palette-style";
import { TrackHero } from "@/features/scrollytelling/components/track-hero";
import type { LinePosition } from "@/lib/lrc";
import { transition } from "@/lib/motion";
import { detectLang } from "@/lib/script";
import {
	getSiteOriginFn,
	getTrackFn,
	getTrackPlaybackFn,
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

		// Deferred separately from the visuals (D-055). Genius `/songs/{id}` is
		// ~3x slower than the search behind the artwork, so one shared promise
		// made the whole hero wait on the slowest thing in it.
		const playback = defer(
			getTrackPlaybackFn({
				data: { title: track.title, artist: track.artist },
			}),
		);

		return { track, visuals, playback, origin };
	},
	head: ({ loaderData, params }) => {
		// One voice with the page it heads: the route's message component
		// already says "Not in the library" (D-104).
		if (!loaderData) return { meta: [{ title: "Not in the library" }] };

		const { title, artist, album, duration, synced } = loaderData.track;
		// "· Lyrics" says what the page IS — a bare "Song — Artist" could be
		// a video, a review, a store (D-104).
		const heading = `${title} — ${artist} · Lyrics`;
		// Differentiated by what this track actually has, not one sentence
		// stamped on every page (D-104).
		const description = synced
			? `Read the lyrics to ${title} by ${artist}, synced line by line to the song.`
			: `Read the lyrics to ${title} by ${artist}, set to be read — not skimmed.`;
		const canonical = `${loaderData.origin}/track/${encodeURIComponent(params.trackId)}`;

		/*
		 * Structured data (D-053). A lyrics page is exactly what MusicRecording
		 * describes, and without it a search engine sees a headline and a wall
		 * of unattributed text.
		 *
		 * Deliberately WITHOUT the `lyrics` property, though the schema allows
		 * it: the words are LRCLIB's user-contributed transcriptions of someone
		 * else's copyrighted work. Displaying them for a reader who navigated
		 * here is the product; serving the full text as machine-readable data
		 * for anyone to ingest is a different act, and not one to take by
		 * default.
		 */
		const jsonLd = {
			"@context": "https://schema.org",
			"@type": "MusicRecording",
			name: title,
			byArtist: { "@type": "MusicGroup", name: artist },
			...(album ? { inAlbum: { "@type": "MusicAlbum", name: album } } : {}),
			// ISO 8601. LRCLIB gives seconds, and omits it more often than not.
			...(duration ? { duration: `PT${Math.round(duration)}S` } : {}),
			url: canonical,
		};

		return {
			scripts: [
				{
					type: "application/ld+json",
					children: JSON.stringify(jsonLd),
				},
			],
			links: [{ rel: "canonical", href: canonical }],
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
				// Prose, not the tab title — "· Lyrics" belongs in a tab, not
				// a sentence (D-104).
				{
					property: "og:image:alt",
					content: `A lyric card for ${title} by ${artist}`,
				},
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
	const { track, visuals, playback } = Route.useLoaderData();
	const navigate = Route.useNavigate();
	const reduceMotion = useReducedMotion();
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [syncPosition, setSyncPosition] = useState<LinePosition | null>(null);
	// The hero's cover is the record now (D-080): it spins on this.
	const [playing, setPlaying] = useState(false);

	/*
	 * The page is a sheet (D-084): it pushes up over discovery when a song is
	 * opened, and the cross sends it back down before navigating. Two flags
	 * rather than one because the middle state matters — `entered` gates the
	 * fixed chrome, which anchors to the article instead of the viewport
	 * while the article is mid-transform, and would otherwise pop in from the
	 * wrong place when the transform clears.
	 */
	const [entered, setEntered] = useState(false);
	const [leaving, setLeaving] = useState(false);

	/*
	 * Insight state lives here now, not in an affordance wrapper (D-084): the
	 * button reads in the hero's column on desktop while the drawer stays at
	 * shell level, and splitting one component across two subtrees means the
	 * state they share has to sit above both.
	 */
	const { state: insightState, insight } = useInsights(track.id);

	// Opening the page is the record — not scrolling, not finishing. A reader
	// who opened something and left still wants to find it again (D-056).
	useRecordVisit({
		id: track.id,
		title: track.title,
		artist: track.artist,
	});

	/*
	 * Which regional Han shapes this page should use (D-057).
	 *
	 * Deliberately a data attribute and NOT `lang`. The two are different
	 * claims: `lang` says "this text is Japanese", which is false for a hero
	 * title like "Pretender · OFFICIAL HIGE DANDISM" — LRCLIB metadata is
	 * usually romanised — and a screen reader would read the credit line in the
	 * wrong voice. `lang` therefore stays on the canvas, where it is true
	 * (D-053), while the typeface follows the lyrics across the whole shell,
	 * which is the right editorial answer: one page, one set of Han shapes.
	 */
	const script = detectLang(
		track.stanzas
			.flatMap((stanza) => stanza.lines.map((line) => line.text))
			.join(" "),
	);

	return (
		<motion.article
			id="main"
			className="track-shell"
			data-track-scope={track.id}
			data-script={script ?? undefined}
			data-drawer={drawerOpen ? "open" : "closed"}
			data-entering={entered ? undefined : ""}
			/*
			  The scaffold push (D-084). The whole shell slides up from the
			  viewport's foot on the drawer's own spring, so opening a song and
			  opening its story are one physical gesture at two scales.

			  Reduced motion lives in the TRANSITION, not in the keys. The
			  server cannot know the reader's preference, so it always renders
			  the pushed-down initial; if the client then animated a different
			  property, the SSR transform would never be managed and the page
			  would stay stranded a viewport down — which is exactly how the
			  first cut of this failed under the harness's reduced-motion
			  profile. Same keys everywhere; the preference only collapses the
			  sweep to an instant cut.
			*/
			initial={{ y: "100dvh" }}
			animate={leaving ? { y: "100dvh" } : { y: 0 }}
			transition={reduceMotion ? { duration: 0 } : transition.sheet}
			onAnimationComplete={() => {
				if (leaving) {
					navigate({ to: "/" });
				} else {
					setEntered(true);
				}
			}}
		>
			{/*
			  The sheet's way down (D-084). Replaces the masthead on this page —
			  the mark yields the corner chrome to the control that undoes the
			  push, and the way home IS the dismissal. Top-right, where a
			  pushed-up sheet is dismissed from.
			*/}
			<button
				type="button"
				className="track-close"
				aria-label="Close and return to discovery"
				onClick={() => setLeaving(true)}
			>
				<svg
					viewBox="0 0 14 14"
					width="14"
					height="14"
					aria-hidden="true"
					focusable="false"
				>
					<path
						d="M2.5 2.5 L11.5 11.5 M11.5 2.5 L2.5 11.5"
						stroke="currentColor"
						strokeWidth="1.6"
						strokeLinecap="round"
					/>
				</svg>
			</button>

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
				playing={playing}
				notice={<VariantNotice title={track.title} />}
				/*
				 * In the hero's column so the desktop rail reads as one
				 * instrument, story button included (D-084). Below `lg` the
				 * button's own CSS keeps it fixed over the lyrics — DOM
				 * position and visual position part ways there, deliberately:
				 * a reader deep in the lyrics still has the reach.
				 */
				discover={
					<DiscoverButton
						state={insightState}
						open={drawerOpen}
						onToggle={() => setDrawerOpen(!drawerOpen)}
					/>
				}
				/*
				 * The bar mounts on the first paint, not when the data arrives
				 * (D-055).
				 *
				 * It used to sit behind `<Await fallback={null}>`, so on an
				 * uncached track — every track the reader has not opened before
				 * — there was no player in the document at all for three to
				 * four seconds, and then one appeared and shoved the page down.
				 * That reads as broken, and was.
				 *
				 * Now it renders immediately in a resolving state and fills in
				 * as each half lands: artwork at about a second, video id at
				 * three.
				 */
				player={
					<Await
						promise={playback}
						fallback={
							<PlaybackBar
								videoId={null}
								resolving
								title={track.title}
								artist={track.artist}
								stanzas={track.stanzas}
								synced={track.synced}
								lyricsDuration={track.duration}
								onSyncChange={setSyncPosition}
								onPlayingChange={setPlaying}
							/>
						}
					>
						{({ youtubeId }) => (
							<PlaybackBar
								videoId={youtubeId}
								resolving={false}
								title={track.title}
								artist={track.artist}
								stanzas={track.stanzas}
								synced={track.synced}
								lyricsDuration={track.duration}
								onSyncChange={setSyncPosition}
								onPlayingChange={setPlaying}
							/>
						)}
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

			{/* The drawer stays at shell level — its open state squeezes the
			    canvas (data-drawer above); only its button moved into the
			    hero's column (D-084). */}
			{insight && (
				<InsightsDrawer
					insight={insight}
					open={drawerOpen}
					onClose={() => setDrawerOpen(false)}
				/>
			)}

			<footer className="track-shell__foot px-6 text-center">
				{/* Where to go when the song ends (D-076) — an offer, not a queue. */}
				<ReadNext currentId={track.id} />

				{/*
				  The reader's way out of a wrong recording (OD-028). At the foot
				  rather than in the hero: it is for someone who has noticed the
				  lyrics are not lining up, and they can only notice that after
				  reading for a moment.
				*/}
				<TrackVersions
					trackId={track.id}
					title={track.title}
					artist={track.artist}
				/>

				<Link
					to="/"
					className="tap mt-10 inline-block text-caption uppercase tracking-label text-accent"
				>
					Search another
				</Link>
			</footer>
		</motion.article>
	);
}
