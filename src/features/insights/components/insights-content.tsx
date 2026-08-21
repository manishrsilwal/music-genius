import type { Insight } from "@/lib/types";

/**
 * The three slots from PRD §3.5 — the Synthesis, the Quote, the Source Gallery.
 * Shared verbatim by the desktop panel and the mobile sheet, so the two can
 * never drift apart.
 */
export function InsightsContent({ insight }: { insight: Insight }) {
	return (
		<div className="insights">
			<section className="insights__synthesis">
				<p className="insights__label text-micro">The Synthesis</p>
				<div className="mt-4 text-lead">
					{insight.synthesis
						.split(/\n{2,}/)
						.filter(Boolean)
						.map((paragraph) => (
							<p key={paragraph.slice(0, 40)}>{paragraph}</p>
						))}
				</div>
			</section>

			{insight.quote && (
				<figure className="insights__quote">
					<blockquote className="text-lead">“{insight.quote.text}”</blockquote>
					<figcaption className="text-micro">
						{insight.quote.attribution}
					</figcaption>
				</figure>
			)}

			{insight.sources.length > 0 && (
				<section>
					<p className="insights__label text-micro">The Source Gallery</p>
					<div className="insights__sources mt-4">
						{insight.sources.map((source) => (
							<a
								key={source.url}
								href={source.url}
								target="_blank"
								rel="noreferrer noopener"
								className="insights__source"
							>
								<span className="insights__label text-micro">
									{source.kind === "video" ? "Video" : "Article"}
								</span>
								<span className="mt-2 block text-caption">{source.title}</span>
							</a>
						))}
					</div>
				</section>
			)}

			{insight.ungrounded && (
				<p className="text-micro text-ink-faint">
					Written from the lyrics alone — no sources were available for this
					track, so no quote is shown.
				</p>
			)}
		</div>
	);
}
