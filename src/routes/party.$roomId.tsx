import { createFileRoute } from "@tanstack/react-router";

import { PartyRoom } from "@/features/party/components/party-room";

/**
 * A listen party room (D-115). The link is the invitation: everything else —
 * joining, the queue, the shared clock — happens client-side against
 * /api/party, because a room is the one thing here that changes under you.
 */
export const Route = createFileRoute("/party/$roomId")({
	head: () => ({
		meta: [
			{ title: "Listen party — Lyrical Explorer" },
			// A private room's preview should not advertise its contents.
			{ name: "robots", content: "noindex" },
		],
	}),
	component: Room,
});

function Room() {
	const { roomId } = Route.useParams();
	return <PartyRoom roomId={roomId} />;
}
