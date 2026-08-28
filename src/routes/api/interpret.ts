/**
 * The feelings chat's wire (D-122).
 *
 *   POST /api/interpret {message} → {heard: Heard | null}
 *
 * The one place a reader's typed words leave the browser, and they carry
 * nothing else — no ids, no history, no stored copy here. `heard: null` is
 * a real answer meaning "nothing clearly implied"; the client falls back to
 * its local keyword reader and never shows an error for it.
 */

import { createFileRoute } from "@tanstack/react-router";

import {
	assertInterpretWithinLimit,
	InterpretError,
	interpretFeelings,
	MESSAGE_LIMIT,
} from "@/server/interpret.server";

const NO_STORE = { "Cache-Control": "no-store" };

/** Same proxy-header read as the party wire (D-117). */
function clientIp(request: Request): string | null {
	return (
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		null
	);
}

export const Route = createFileRoute("/api/interpret")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				let body: Record<string, unknown>;
				try {
					body = (await request.json()) as Record<string, unknown>;
				} catch {
					return Response.json(
						{ error: "Malformed request" },
						{ status: 400, headers: NO_STORE },
					);
				}

				const message = typeof body.message === "string" ? body.message : "";
				if (!message.trim()) {
					return Response.json(
						{ error: "Nothing to read" },
						{ status: 400, headers: NO_STORE },
					);
				}
				if (message.length > MESSAGE_LIMIT * 2) {
					return Response.json(
						{ error: "That is more than a feeling" },
						{ status: 413, headers: NO_STORE },
					);
				}

				try {
					await assertInterpretWithinLimit(clientIp(request));
					const heard = await interpretFeelings(message);
					return Response.json({ heard }, { headers: NO_STORE });
				} catch (error) {
					if (error instanceof InterpretError) {
						return Response.json(
							{ error: error.message },
							{ status: error.status, headers: NO_STORE },
						);
					}
					console.warn("[api/interpret] failed", error);
					return Response.json(
						{ error: "The reader missed a beat — try again" },
						{ status: 500, headers: NO_STORE },
					);
				}
			},
		},
	},
});
