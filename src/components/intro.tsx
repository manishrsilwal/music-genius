import { useEffect } from "react";

import "./intro.scss";

const SEEN = "tle:intro-seen";

/**
 * The arrival moment (D-064).
 *
 * Rendered by the SERVER, on the first paint, and cleared by CSS — not by
 * React. That ordering is the whole design:
 *
 *   - If it waited for hydration it would flash in *after* the page, which is
 *     the opposite of an intro.
 *   - If JavaScript never arrives, a JS-driven overlay would sit on the page
 *     forever and lock the reader out. The animation that removes it is pure
 *     CSS with `forwards` fill, so the page frees itself whatever happens to
 *     the bundle.
 *
 * React's only job is the one thing CSS cannot know: whether this reader has
 * already seen it this session. That check runs in a layout effect before
 * paint, so a returning reader never sees a frame of it.
 */
export function Intro() {
	useEffect(() => {
		try {
			if (sessionStorage.getItem(SEEN)) {
				// Already seen — kill it without playing. The class is on <html>
				// so the rule can win regardless of where this component sits.
				document.documentElement.dataset.intro = "seen";
			} else {
				sessionStorage.setItem(SEEN, "1");
			}
		} catch {
			// Private mode, or storage disabled. Playing the intro again is a far
			// better failure than throwing on the first render of every page.
		}
	}, []);

	return (
		<div className="intro" aria-hidden="true">
			<div className="intro__inner">
				{/*
				  The same three rules as the masthead — a stanza. They draw in
				  rather than fade, because the mark is about lines of writing
				  appearing, and a fade says nothing about what it is.
				*/}
				<svg
					className="intro__mark"
					viewBox="0 0 16 16"
					width="64"
					height="64"
					aria-hidden="true"
					focusable="false"
				>
					<rect
						className="intro__rule"
						x="0"
						y="3"
						width="16"
						height="1.6"
						rx="0.8"
					/>
					<rect
						className="intro__rule intro__rule--2"
						x="0"
						y="7.2"
						width="10.5"
						height="1.6"
						rx="0.8"
					/>
					<rect
						className="intro__rule intro__rule--3"
						x="0"
						y="11.4"
						width="13.5"
						height="1.6"
						rx="0.8"
					/>
				</svg>

				<p className="intro__word">Refrain</p>
			</div>
		</div>
	);
}
