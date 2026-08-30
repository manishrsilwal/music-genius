import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import "./v2.scss";

/**
 * REFRAIN v2 (D-125) — the Gen-Z cut, living beside v1 at /v2 so the owner
 * can compare both live and keep one later. Same backend, same catalogue,
 * same party rooms; only the skin differs. Built strictly from the UI/UX
 * Pro Max cards confirmed by the owner: `neubrutalism` style, the "Social
 * Media App" palette, the "Gen Z Brutal" font pairing (Anton + Epilogue).
 *
 * This file is the LAYOUT of every /v2 page — the flat-route lesson D-115
 * paid for, used deliberately this time: fonts, the top bar and the .v2
 * scope load once here, and each surface renders into the Outlet.
 */

export const Route = createFileRoute("/v2")({
	head: () => ({
		meta: [{ title: "Refrain v2 — feel it, read it, share it" }],
		links: [
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Anton&family=Epilogue:wght@400;500;600;700;800&display=swap",
			},
		],
	}),
	component: V2Layout,
});

function V2Layout() {
	return (
		<div className="v2">
			<div className="v2__frame">
				<header className="v2__bar">
					<Link to="/v2" className="v2__logo">
						Refrain
					</Link>
					<span className="v2__tag">v2 · the loud cut</span>
					<nav className="v2__nav" aria-label="Refrain v2">
						<Link
							to="/v2"
							className="v2__nav-pill"
							activeOptions={{ exact: true }}
							activeProps={{ "data-active": true }}
						>
							Discover
						</Link>
						<Link
							to="/v2/party"
							className="v2__nav-pill"
							activeProps={{ "data-active": true }}
						>
							Party
						</Link>
						<Link to="/" className="v2__nav-pill">
							v1 ↗
						</Link>
					</nav>
				</header>
				<Outlet />
			</div>
		</div>
	);
}
