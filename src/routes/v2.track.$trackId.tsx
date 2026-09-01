import {
	Await,
	createFileRoute,
	defer,
	notFound,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useRecordVisit } from "@/features/discovery/hooks/use-history";
import { useInsights } from "@/features/insights/hooks/use-insights";
import { PlaybackBar } from "@/features/playback/components/playback-bar";
import { type LinePosition, lineKey } from "@/lib/lrc";
import { getTrackFn, getTrackPlaybackFn } from "@/server/lyrics.functions";

/**
 * v2 Lyrics view (D-125): the reading focus. Large bold lines, the current
 * line marked hard in the accent (the neubrutal card's marker, not a glow),
 * and almost no chrome — title, artist, words, transport. Reuses v1's
 * entire playback machinery: the bar reports LinePosition and this page
 * only decides how a line LOOKS when it is the one being sung.
 *
 * UX cards applied: reading measure capped at 65ch, line-height 1.5.
 */

export const Route = createFileRoute("/v2/track/$trackId")({
	loader: async ({ params }) => {
		const track = await getTrackFn({ data: { id: params.trackId } });
		if (!track) throw notFound();
		const playback = defer(
			getTrackPlaybackFn({
				data: { title: track.title, artist: track.artist },
			}),
		);
		return { track, playback };
	},
	head: ({ loaderData }) => ({
		meta: [
			{
				title: loaderData
					? `${loaderData.track.title} — ${loaderData.track.artist} · Refrain v2`
					: "Not in the library",
			},
		],
	}),
	component: ReadV2,
	notFoundComponent: () => (
		<p className="disco__empty">
			Not in the library — head back and search again.
		</p>
	),
});

/** How long a manual scroll holds off the auto-follow. */
const MANUAL_HOLD_MS = 4_000;

function ReadV2() {
	const { track, playback } = Route.useLoaderData();
	const [position, setPosition] = useState<LinePosition | null>(null);
	// The meaning (owner's review: it was missing from v2 entirely) — the
	// same engine as v1's drawer, worn as a panel after the words.
	const { state: insightState, insight } = useInsights(track.id);
	// The same reading trail v1 keeps (D-126): this visit joins Continue
	// reading, and the shelves push what was read to the back.
	useRecordVisit({ id: track.id, title: track.title, artist: track.artist });

	/*
	 * Follow the song unless the reader just took the wheel — the same
	 * contract v1's canvas keeps, in one timestamp instead of a hook: any
	 * wheel/touch/key scroll pauses following for a beat.
	 */
	const lastManual = useRef(0);
	useEffect(() => {
		const note = () => {
			lastManual.current = Date.now();
		};
		window.addEventListener("wheel", note, { passive: true });
		window.addEventListener("touchmove", note, { passive: true });
		return () => {
			window.removeEventListener("wheel", note);
			window.removeEventListener("touchmove", note);
		};
	}, []);

	const reduce = useRef(false);
	useEffect(() => {
		reduce.current = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the active line IS the schedule
	useEffect(() => {
		if (!position) return;
		if (Date.now() - lastManual.current < MANUAL_HOLD_MS) return;
		document.getElementById(`v2line-${position.key}`)?.scrollIntoView({
			behavior: reduce.current ? "auto" : "smooth",
			block: "center",
		});
	}, [position?.key]);

	return (
		<main>
			<header className="v2read__head">
				<h1 className="v2read__title">{track.title}</h1>
				<span className="v2read__artist">{track.artist}</span>
			</header>

			{/*
			  Two columns from lg (owner's dock review): the words keep their
			  left measure, and the player takes the right half that sat
			  empty — a sticky panel that can never overlap a lyric. Below
			  lg the player returns to the bottom of the screen, compact.
			*/}
			<div className="v2read__grid">
				<div className="v2read__lines">
					{track.stanzas.map((stanza, s) => (
						<div key={stanza.id} className="contents">
							{s > 0 && (
								<div className="v2read__stanza-gap" aria-hidden="true" />
							)}
							{stanza.lines.map((line, l) =>
								line.text.trim().length > 0 ? (
									<p
										key={lineKey(s, l)}
										id={`v2line-${lineKey(s, l)}`}
										className="v2read__line"
										data-active={position?.key === lineKey(s, l) || undefined}
									>
										{line.text}
									</p>
								) : null,
							)}
						</div>
					))}
				</div>

				{/*
				  The rail (owner's request): player on top, the meaning right
				  under it — visible without reaching the words' end. The rail
				  is sticky as a whole; the meaning card scrolls INSIDE itself,
				  so the page keeps its one scrollbar.
				*/}
				<aside className="v2read__rail">
					<div className="v2read__player">
						{/*
					  The whole playback deal, said once up top (owner's ask):
					  what Spotify gives, what Premium unlocks, what YouTube
					  trades — so the switch below is an informed choice, not
					  a mystery lever. Written copy; the bar's own status line
					  still reports the live specifics underneath.
					*/}
						<div className="v2read__player-head">
							<h2 className="v2read__player-title">Play it here</h2>
							<p className="v2read__player-note">
								Spotify plays a 30-second preview — with Premium signed in on
								this browser, it's the full song. YouTube plays everything as a
								video, intros and all. Switch between them below, free, anytime.
							</p>
						</div>
						<Await
							promise={playback}
							fallback={
								<PlaybackBar
									videoId={null}
									spotifyId={null}
									resolving
									title={track.title}
									artist={track.artist}
									stanzas={track.stanzas}
									synced={track.synced}
									lyricsDuration={track.duration}
									onSyncChange={setPosition}
								/>
							}
						>
							{({ youtubeId, spotifyId }) => (
								<PlaybackBar
									videoId={youtubeId}
									spotifyId={spotifyId}
									resolving={false}
									title={track.title}
									artist={track.artist}
									stanzas={track.stanzas}
									synced={track.synced}
									lyricsDuration={track.duration}
									onSyncChange={setPosition}
								/>
							)}
						</Await>
					</div>

					{/*
					  "For you" is its own card, cut from the meaning card's
					  cloth and seated above it (owner's call). It gates
					  itself: resonance is null when the reader has stated no
					  preferences, so someone who arrived by search alone
					  simply never sees it — no personal claim without a
					  person to claim it about.
					*/}
					{insightState !== "unavailable" && insight?.resonance && (
						<section className="v2read__meaning v2read__meaning--you">
							<h2 className="v2read__meaning-title">For you</h2>
							<div className="v2read__meaning-body">
								{insight.resonance.lines.map((line) => (
									<p key={line} className="v2read__meaning-line">
										{line}
									</p>
								))}
								<p className="v2read__meaning-p">{insight.resonance.text}</p>
							</div>
						</section>
					)}

					{insightState !== "unavailable" && (
						<section className="v2read__meaning">
							<h2 className="v2read__meaning-title">What it means</h2>
							<div className="v2read__meaning-body">
								{insightState === "generating" && (
									<p className="v2read__meaning-p">
										Reading between the lines…
									</p>
								)}
								{insightState === "failed" && (
									<p className="v2read__meaning-p">
										The meaning didn't load this time — the words still say
										plenty.
									</p>
								)}
								{insight && (
									<>
										{insight.synthesis.split("\n\n").map((para) => (
											<p key={para.slice(0, 32)} className="v2read__meaning-p">
												{para}
											</p>
										))}
										{insight.quote && (
											<blockquote className="v2read__meaning-quote">
												“{insight.quote.text}”
												<cite>— {insight.quote.attribution}</cite>
											</blockquote>
										)}
									</>
								)}
							</div>
						</section>
					)}
				</aside>
			</div>
		</main>
	);
}
