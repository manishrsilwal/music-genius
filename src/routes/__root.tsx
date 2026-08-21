import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				name: "description",
				content:
					"Lyrics as a premium editorial reading experience \u2014 synced, annotated, and beautifully set.",
			},
			{
				title: "Typographic Lyrical Explorer",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
	/**
	 * Without this, TanStack Router falls back to a bare <p>Not Found</p> for
	 * any unmatched URL — and warns about it on every boot.
	 */
	notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "Tanstack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
						TanStackQueryDevtools,
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}

function NotFound() {
	return (
		<main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 text-center">
			<p className="text-micro uppercase tracking-label text-ink-faint">404</p>
			<h1 className="mt-6 font-display text-display leading-display text-ink">
				Nothing here
			</h1>
			<p className="mt-4 text-lead text-ink-muted">
				That page doesn't exist. The songs are this way.
			</p>
			<Link
				to="/"
				className="mt-8 text-caption uppercase tracking-label text-accent"
			>
				Back to search
			</Link>
		</main>
	);
}
