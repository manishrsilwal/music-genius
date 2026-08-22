import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * The full-page message shell: not found, and anything that went wrong
 * (D-041).
 *
 * One component rather than three near-copies, so a dead end still looks like
 * this product rather than like a stack trace. The shape mirrors the track
 * hero — kicker, display headline, lead, one way onward — because a reader who
 * lands here has still landed somewhere.
 */
export function RouteMessage({
	kicker,
	title,
	body,
	action,
	children,
}: {
	kicker: string;
	title: string;
	body: ReactNode;
	/** Defaults to search, which is the only place worth sending someone. */
	action?: { to: string; label: string };
	children?: ReactNode;
}) {
	const { to, label } = action ?? { to: "/", label: "Back to search" };

	return (
		<main
			id="main"
			className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 text-center"
		>
			<p className="text-micro uppercase tracking-label text-ink-faint">
				{kicker}
			</p>
			<h1 className="mt-6 font-display text-display leading-display text-ink">
				{title}
			</h1>
			<p className="mt-4 text-lead text-ink-muted">{body}</p>
			{children}
			<Link
				to={to}
				className="mt-8 text-caption uppercase tracking-label text-accent"
			>
				{label}
			</Link>
		</main>
	);
}
