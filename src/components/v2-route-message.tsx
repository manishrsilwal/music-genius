import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link, useRouter } from "@tanstack/react-router";

/**
 * The loud cut's 404 and 500 (D-135).
 *
 * Errors and misses under /v2 used to bubble to the ROOT boundaries, which
 * wear v1 — and worse, replacing the tree dropped the `.v2` scope, so v1's
 * masthead came back over a v1 message page. A reader two screens deep in
 * the loud cut was suddenly somewhere else entirely.
 *
 * Placement is what makes these stay in costume: V2NotFound hangs on the
 * /v2 LAYOUT route, where a not-found renders in the layout's own outlet —
 * bar kept, scope kept. V2Error hangs on each v2 CHILD route, so a loader
 * or render failure is caught inside the layout instead of bubbling past
 * it to the root.
 */

function V2Message({
	code,
	title,
	body,
	children,
}: {
	code: string;
	title: string;
	body: string;
	children?: React.ReactNode;
}) {
	return (
		<main id="main" className="v2error">
			<p className="v2error__code" aria-hidden="true">
				{code}
			</p>
			<h1 className="v2error__title">{title}</h1>
			<p className="v2error__body">{body}</p>
			<div className="v2error__actions">
				{children}
				<Link to="/v2" className={children ? "v2error__quiet" : "v2error__go"}>
					Back to Discover
				</Link>
			</div>
		</main>
	);
}

export function V2NotFound() {
	return (
		<V2Message
			code="404"
			title="Nothing here"
			body="That page doesn't exist — the songs are this way."
		/>
	);
}

export function V2Error({ error, reset }: ErrorComponentProps) {
	const router = useRouter();

	const retry = () => {
		// Clear the boundary, then re-run the loaders — without the
		// invalidate the boundary resets and re-throws the cached failure
		// (the same lesson v1's boundary carries, D-041).
		reset();
		router.invalidate();
	};

	return (
		<V2Message
			code="500"
			title="That did not load"
			body="The lyrics service did not answer. It is usually back within a moment."
		>
			<button type="button" onClick={retry} className="v2error__go">
				Try again
			</button>
			{/* Development only — an error can carry a URL or key fragment. */}
			{import.meta.env.DEV && error instanceof Error && (
				<pre className="v2error__detail">{error.message}</pre>
			)}
		</V2Message>
	);
}
