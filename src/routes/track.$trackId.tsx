import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { motion } from "motion/react";

import { LyricCanvas } from "@/features/scrollytelling/components/lyric-canvas";
import { riseVariants, staggerVariants, transition } from "@/lib/motion";
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
			? { meta: [{ title: `${loaderData.title} — ${loaderData.artist}` }] }
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
		<article>
			{/*
			  Hero (PRD §3.2). The full-bleed blurred album art needs the Genius
			  API and is blocked on OD-005, so this is currently typographic only.
			*/}
			<motion.header
				className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-6 text-center"
				variants={staggerVariants}
				initial="hidden"
				animate="visible"
			>
				<motion.p
					variants={riseVariants}
					className="text-micro uppercase tracking-label text-ink-faint"
				>
					{track.synced ? "Time-synced" : "Lyrics"}
				</motion.p>

				<motion.h1
					variants={riseVariants}
					transition={transition.cinematic}
					className="mt-8 font-display text-hero leading-hero tracking-hero text-ink"
				>
					{track.title}
				</motion.h1>

				<motion.p
					variants={riseVariants}
					className="mt-8 text-lead text-ink-muted"
				>
					{track.artist}
					{track.album ? ` · ${track.album}` : ""}
				</motion.p>
			</motion.header>

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
