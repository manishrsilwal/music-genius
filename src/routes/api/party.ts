/**
 * The listen party's wire (D-115).
 *
 *   GET  /api/party?room=&member=   → poll: room view + serverNow (heartbeat)
 *   POST /api/party {action, ...}   → create | join | add | control
 *
 * Never cached: a party is the one resource here whose whole point is that it
 * changes under you. No login anywhere on this wire — identity is an
 * ephemeral member id, hosting is a secret key returned once at creation.
 */

import { createFileRoute } from "@tanstack/react-router";

import {
	addPartyTrack,
	controlParty,
	createParty,
	joinParty,
	PartyError,
	syncParty,
} from "@/server/party.server";

const NO_STORE = { "Cache-Control": "no-store" };

function fail(error: unknown): Response {
	if (error instanceof PartyError) {
		return Response.json(
			{ error: error.message },
			{ status: error.status, headers: NO_STORE },
		);
	}
	console.warn("[api/party] failed", error);
	return Response.json(
		{ error: "The party server missed a beat — try again" },
		{ status: 500, headers: NO_STORE },
	);
}

export const Route = createFileRoute("/api/party")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const params = new URL(request.url).searchParams;
				const room = params.get("room")?.trim();
				if (!room) {
					return Response.json(
						{ error: "Missing `room`" },
						{ status: 400, headers: NO_STORE },
					);
				}
				try {
					const state = await syncParty(room, params.get("member"));
					return Response.json(state, { headers: NO_STORE });
				} catch (error) {
					return fail(error);
				}
			},

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

				try {
					switch (body.action) {
						case "create": {
							const created = await createParty(String(body.name ?? ""));
							if (!created) {
								return Response.json(
									{ error: "A name is needed to host" },
									{ status: 400, headers: NO_STORE },
								);
							}
							return Response.json(created, { headers: NO_STORE });
						}
						case "join": {
							const state = await joinParty(
								String(body.room ?? ""),
								String(body.name ?? ""),
							);
							return Response.json(state, { headers: NO_STORE });
						}
						case "add": {
							const track = body.track as {
								id: string;
								title: string;
								artist: string;
								duration: number | null;
							};
							if (!track?.id || !track.title || !track.artist) {
								return Response.json(
									{ error: "Malformed track" },
									{ status: 400, headers: NO_STORE },
								);
							}
							const state = await addPartyTrack(
								String(body.room ?? ""),
								String(body.member ?? ""),
								track,
							);
							return Response.json(state, { headers: NO_STORE });
						}
						case "control": {
							const state = await controlParty(
								String(body.room ?? ""),
								String(body.hostKey ?? ""),
								body.control as Parameters<typeof controlParty>[2],
							);
							return Response.json(state, { headers: NO_STORE });
						}
						default:
							return Response.json(
								{ error: "Unknown action" },
								{ status: 400, headers: NO_STORE },
							);
					}
				} catch (error) {
					return fail(error);
				}
			},
		},
	},
});
