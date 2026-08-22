import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { RouteError } from "../components/route-error";
import { RouteMessage } from "../components/route-message";
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
	/**
	 * The backstop. Any route without its own boundary lands here rather than
	 * on the framework's default, which is a stack trace on a white page
	 * (D-041).
	 */
	errorComponent: RouteError,
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
		<RouteMessage
			kicker="404"
			title="Nothing here"
			body="That page doesn't exist. The songs are this way."
		/>
	);
}
