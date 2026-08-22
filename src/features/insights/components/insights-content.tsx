import type { SyntheticEvent } from "react";

import type { Insight } from "@/lib/types";

/**
 * The three slots from PRD §3.5 — the Synthesis, the Quote, the Sources.
 * Shared verbatim by the desktop panel and the mobile sheet, so the two can
 * never drift apart.
 *
 * The sources are a numbered reference list rather than the horizontal gallery
 * the PRD describes (D-043). A carousel inside a 30rem reading panel puts two
 * scroll axes in the reader's way, and the numbering earns its keep: the quote
 * already carries a `sourceIndex`, so the citation becomes something the
 * reader can follow instead of metadata only the code can see.
 */

/**
 * Favicons and YouTube stills 404 often enough to matter. A broken-image glyph
 * beside a citation is worse than no image at all, so drop it silently.
 */
function hide(event: SyntheticEvent<HTMLImageElement>) {
	event.currentTarget.style.display = "none";
}

/** `https://www.theguardian.com/culture/...` → `theguardian.com`. */
export function domainOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

export function InsightsContent({ insight }: { insight: Insight }) {
	return (
		<div className="insights">
			<section className="insights__synthesis">
				<p className="insights__label text-micro">The Synthesis</p>
				<div className="insights__prose mt-4 text-lead">
					{insight.synthesis
						.split(/\n{2,}/)
						.filter(Boolean)
						.map((paragraph) => (
							<p key={paragraph.slice(0, 40)}>{paragraph}</p>
						))}
				</div>
			</section>

			{/*
			  The personal slot (D-047). Sits above the artist quote: it is the
			  reason this reader is here, and the quote is context that follows.
			  Every line has been verified verbatim against this track's lyrics
			  server-side, so a reader who scrolls will find them.
			*/}
			{insight.resonance && (
				<section className="insights__resonance">
					<p className="insights__label text-micro">Why this, for you</p>
					<ol className="insights__lines mt-4">
						{insight.resonance.lines.map((line) => (
							<li key={line} className="insights__line text-lead">
								{line}
							</li>
						))}
					</ol>
					<div className="insights__prose mt-4 text-lead">
						{insight.resonance.text
							.split(/\n{2,}/)
							.filter(Boolean)
							.map((paragraph) => (
								<p key={paragraph.slice(0, 40)}>{paragraph}</p>
							))}
					</div>
				</section>
			)}

			{insight.quote && (
				<figure className="insights__quote">
					<blockquote className="text-lead">“{insight.quote.text}”</blockquote>
					<figcaption className="text-micro">
						{insight.quote.attribution}
						{/*
						  The quote survived the verbatim gate against this exact
						  source (D-030), so say which one. Previously the index
						  was enforced in code and then thrown away.
						*/}
						<a
							href={`#source-${insight.quote.sourceIndex}`}
							className="insights__cite"
						>
							{insight.quote.sourceIndex + 1}
						</a>
					</figcaption>
				</figure>
			)}

			{insight.sources.length > 0 && (
				<section>
					<p className="insights__label text-micro">The Sources</p>
					{/* Numbered so the quote's citation points somewhere real. */}
					<ol className="insights__sources mt-4">
						{insight.sources.map((source, index) => (
							<li
								key={source.url}
								id={`source-${index}`}
								className="insights__source"
							>
								<a
									href={source.url}
									target="_blank"
									rel="noreferrer noopener"
									className="insights__source-link"
								>
									{source.kind === "video" && source.thumbnail ? (
										<img
											src={source.thumbnail}
											alt=""
											loading="lazy"
											className="insights__source-still"
											onError={hide}
										/>
									) : null}

									<span className="insights__source-body">
										<span className="insights__source-title text-caption">
											{source.title}
										</span>
										<span className="insights__source-meta text-micro">
											{source.kind === "article" && source.thumbnail ? (
												<img
													src={source.thumbnail}
													alt=""
													loading="lazy"
													className="insights__source-mark"
													onError={hide}
												/>
											) : null}
											{domainOf(source.url)}
											{source.kind === "video" ? " · Video" : ""}
										</span>
									</span>
								</a>
							</li>
						))}
					</ol>
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
