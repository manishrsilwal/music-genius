import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";

import { riseVariants, staggerVariants, stanzaOpacity } from "@/lib/motion";

export const Route = createFileRoute("/")({ component: Foundation });

/**
 * TEMPORARY — foundation smoke-test, not a design.
 *
 * Exists so the type scale, both typefaces, the runtime accent channel, and
 * the motion primitives can be verified in the browser before feature work
 * begins. Replaced by "Today's Deep Dives" (PRD §3.1) in the next block.
 */
function Foundation() {
	return (
		<motion.main
			className="mx-auto max-w-4xl px-6 py-24"
			variants={staggerVariants}
			initial="hidden"
			animate="visible"
		>
			<motion.p
				variants={riseVariants}
				className="font-ui text-micro uppercase tracking-label text-ink-faint"
			>
				Foundation check
			</motion.p>

			<motion.h1
				variants={riseVariants}
				className="mt-6 font-display text-hero leading-hero tracking-hero text-ink"
			>
				Typographic
				<br />
				Lyrical Explorer
			</motion.h1>

			<motion.p
				variants={riseVariants}
				className="mt-8 font-ui text-lead text-ink-muted"
			>
				Rufina sets the display. Elms Sans carries the interface. The accent
				below is driven by <code className="text-accent">--track-accent</code>,
				the channel album-art extraction will repaint per track.
			</motion.p>

			<motion.div variants={riseVariants} className="mt-14 space-y-3">
				{["Fully opaque — the stanza in focus", "Faded to twenty percent"].map(
					(line, i) => (
						<p
							key={line}
							className="font-display text-lyric leading-lyric text-ink"
							style={{
								opacity: i === 0 ? stanzaOpacity.active : stanzaOpacity.idle,
							}}
						>
							{line}
						</p>
					),
				)}
			</motion.div>

			<motion.div
				variants={riseVariants}
				className="mt-14 flex items-center gap-4"
			>
				<span
					className="inline-flex items-center rounded-card border px-5 py-3 font-ui text-caption backdrop-blur"
					style={{
						background: "var(--glass-bg)",
						borderColor: "var(--glass-border)",
						backdropFilter: "blur(var(--glass-blur))",
					}}
				>
					Glass surface
				</span>
				<span className="size-10 rounded-full bg-accent" />
			</motion.div>
		</motion.main>
	);
}
