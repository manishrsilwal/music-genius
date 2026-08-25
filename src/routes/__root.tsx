import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Intro } from "@/components/intro";
import { Masthead } from "@/components/masthead";
import { RouteFocus } from "@/components/route-focus";
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
				/*
				 * Benefit-first, in the product's own voice (D-104). "A premium
				 * editorial reading experience" described the pitch, not the
				 * reader's gain — the register the UI copy itself never uses.
				 */
				content:
					"Lyrics synced line by line to the song, set like print, with the story behind the words.",
			},
			{
				/*
				 * The name readers see (D-104). The chrome has said "Lyrical
				 * Explorer" since D-059; "Typographic Lyrical Explorer" was the
				 * PRD's codename, three abstract nouns that truncate in a tab
				 * and appear nowhere in the UI. The tagline rides the landing
				 * title — it is the product's best line.
				 */
				title: "Lyrical Explorer — read the words properly",
			},
			/*
			 * Social cards (D-051). A shared link previously rendered as a bare
			 * URL, which for a product whose whole argument is that lyrics
			 * deserve to be set properly is the worst possible first
			 * impression. Track routes override og:title, og:description and
			 * og:image per song; these are the defaults for everything else.
			 */
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "Lyrical Explorer" },
			{ property: "og:title", content: "Lyrical Explorer — read the words properly" },
			{
				property: "og:description",
				content:
					"Lyrics synced line by line to the song, set like print, with the story behind the words.",
			},
			{ name: "twitter:card", content: "summary_large_image" },
			{
				name: "theme-color",
				content: "#191a20",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			/*
			 * SVG only, with no .ico fallback: every browser that can run this
			 * app supports it, and an .ico would be a second asset carrying the
			 * same mark at worse fidelity.
			 */
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
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
				{/*
				 * First focusable thing on the page, before any chrome. A track
				 * page is one long scroll of lyrics, so a keyboard reader who
				 * had to tab past the search field, the dock and the drawer
				 * affordance to reach the words would be paying for our layout.
				 */}
				<a href="#main" className="skip-link">
					Skip to content
				</a>
				{/*
				  Rendered here rather than per route, so the way home is in the
				  same place on every page and cannot go missing on one of them
				  (D-059). After the skip link deliberately: a keyboard reader
				  wants the words first, not the chrome.
				*/}
				{/* Server-rendered so it is on the first paint, and cleared by
				    CSS so it cannot trap anyone if the bundle fails (D-064). */}
				<Intro />
				<Masthead />
				{/* Focus follows the route, the way it would across documents
				    (D-062). Renders nothing. */}
				<RouteFocus />
				{children}
				{/*
				  Development only (D-067).
				  
				  This shipped unconditionally — a scaffolder default nobody
				  gated — so the production build put a floating devtools
				  trigger in the bottom-right corner of every page, which is
				  exactly where the Discover button lives. A reader got a
				  control that is not part of the product sitting on top of the
				  one that is, plus the devtools bundle on every page load.
				  
				  `import.meta.env.DEV` is statically replaced at build time, so
				  the whole subtree — and its imports — drop out of the
				  production bundle rather than merely rendering nothing.
				*/}
				{import.meta.env.DEV && (
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
				)}
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
