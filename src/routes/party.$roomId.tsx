import { createFileRoute } from "@tanstack/react-router";

import { PartyRoom } from "@/features/party/components/party-room";
import { getSiteOriginFn } from "@/server/lyrics.functions";

/**
 * A listen party room (D-115). The link is the invitation: everything else —
 * joining, the queue, the shared clock — happens client-side against
 * /api/party, because a room is the one thing here that changes under you.
 *
 * The head is the invitation's clothes (D-117): a room link travels through
 * chats, and it previewed as a bare URL. One track-agnostic card serves every
 * invite — no room id ever reaches a crawler's image fetch — and the page
 * stays noindex: dressed for the friend it was sent to, invisible to search.
 */
export const Route = createFileRoute("/party/$roomId")({
	loader: () => getSiteOriginFn(),
	head: ({ loaderData }) => {
		const origin = loaderData ?? "";
		return {
			meta: [
				{ title: "Listen party — Refrain" },
				// A private room's preview should not advertise its contents.
				{ name: "robots", content: "noindex" },
				{
					name: "description",
					content:
						"You're invited: one queue, one clock, everyone's lyrics in step. No account needed.",
				},
				{ property: "og:title", content: "You're invited to a listen party" },
				{
					property: "og:description",
					content:
						"One queue, one clock, everyone's lyrics in step. Join with the link — no account needed.",
				},
				// Absolute when SITE_URL is configured (D-051): crawlers drop a
				// relative og:image rather than resolving it.
				{ property: "og:image", content: `${origin}/api/og?card=party` },
				{ property: "og:image:width", content: "1080" },
				{ property: "og:image:height", content: "1080" },
				{
					property: "og:image:alt",
					content: "An invitation to a listen party on Refrain",
				},
			],
		};
	},
	component: Room,
});

function Room() {
	const { roomId } = Route.useParams();
	return <PartyRoom roomId={roomId} />;
}
