/**
 * POST /api/card   (PRD §3.4)
 *
 * Renders a Lyric Card and returns a PNG. POST rather than GET because a
 * six-line verse plus metadata does not reliably fit in a URL.
 */

import { createFileRoute } from "@tanstack/react-router";

import { MAX_LINES, MIN_LINES, themeById } from "@/lib/card";
import { renderCard } from "@/server/card.server";

interface CardBody {
	lines?: unknown;
	title?: unknown;
	artist?: unknown;
	themeId?: unknown;
	palette?: unknown;
	variant?: unknown;
	format?: unknown;
}

export const Route = createFileRoute("/api/card")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				let body: CardBody;
				try {
					body = (await request.json()) as CardBody;
				} catch {
					return Response.json({ error: "Invalid JSON body" }, { status: 400 });
				}

				const lines = Array.isArray(body.lines)
					? body.lines
							.map((line) => String(line))
							.filter((line) => line.trim().length > 0)
					: [];

				if (lines.length < MIN_LINES || lines.length > MAX_LINES) {
					return Response.json(
						{ error: `Select between ${MIN_LINES} and ${MAX_LINES} lines` },
						{ status: 400 },
					);
				}

				// Allowlisted, not trusted: anything but the loud cut is classic,
				// anything but a story is square.
				const variant = body.variant === "loud" ? "loud" : "classic";
				const format = body.format === "story" ? "story" : "square";
				const theme = themeById(
					(body.palette as never) ?? null,
					String(body.themeId ?? "dusk"),
					variant,
				);

				try {
					const png = await renderCard({
						lines,
						title: String(body.title ?? "").slice(0, 80),
						artist: String(body.artist ?? "").slice(0, 80),
						theme,
						variant,
						format,
					});

					return new Response(png as unknown as BodyInit, {
						headers: {
							"Content-Type": "image/png",
							"Content-Disposition": 'attachment; filename="lyric-card.png"',
							"Cache-Control": "no-store",
						},
					});
				} catch (error) {
					console.warn("[api/card] render failed", error);
					return Response.json(
						{ error: "Could not render the card" },
						{ status: 500 },
					);
				}
			},
		},
	},
});
