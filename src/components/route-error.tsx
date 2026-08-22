import type { ErrorComponentProps } from "@tanstack/react-router";
import { useRouter } from "@tanstack/react-router";

import { RouteMessage } from "./route-message";

/**
 * What a reader sees when a loader throws (D-041).
 *
 * LRCLIB and Genius going down is a normal Tuesday, not an exception, and
 * until now that fell through to the framework's default — which is a stack
 * trace on a white page. Retry first, because the overwhelmingly likely cause
 * is a request that failed once.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
	const router = useRouter();

	const retry = () => {
		// Clear the boundary, then re-run the loaders. Without the invalidate
		// the boundary resets and immediately re-throws the cached failure.
		reset();
		router.invalidate();
	};

	return (
		<RouteMessage
			kicker="Something went wrong"
			title="That did not load"
			body="The lyrics service did not answer. It is usually back within a moment."
		>
			<button
				type="button"
				onClick={retry}
				className="mt-8 rounded-full border border-accent px-5 py-3 font-ui text-caption uppercase tracking-label text-accent"
			>
				Try again
			</button>

			{/*
			  Development only. A reader gains nothing from the message and a
			  thrown error can carry a URL or a key fragment, so it must never
			  reach a production page.
			*/}
			{import.meta.env.DEV && error instanceof Error && (
				<pre className="mt-6 max-w-full overflow-x-auto text-left text-micro text-ink-faint">
					{error.message}
				</pre>
			)}
		</RouteMessage>
	);
}
