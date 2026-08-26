import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
	readStoredName,
	storeName,
	storeSession,
} from "@/features/party/hooks/use-party";
import "@/features/party/components/party.scss";

/**
 * Start a listen party (D-115). One field, one button: the host names
 * themselves, gets a room, and the link IS the invitation — no accounts on
 * either side of it.
 */
export const Route = createFileRoute("/party/")({
	head: () => ({
		meta: [
			{ title: "Start a listen party — Lyrical Explorer" },
			{
				name: "description",
				content:
					"Listen together: one queue, one clock, everyone's lyrics in step. Share a link, no accounts.",
			},
		],
	}),
	component: StartParty,
});

function StartParty() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setName(readStoredName());
	}, []);

	const start = async (event: React.FormEvent) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const response = await fetch("/api/party", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "create", name }),
			});
			const payload = (await response.json()) as {
				roomId?: string;
				hostKey?: string;
				memberId?: string;
				error?: string;
			};
			if (!response.ok || !payload.roomId) {
				throw new Error(payload.error ?? "Could not start the party");
			}
			storeName(name.trim());
			storeSession(payload.roomId, {
				memberId: String(payload.memberId),
				hostKey: String(payload.hostKey),
			});
			navigate({ to: "/party/$roomId", params: { roomId: payload.roomId } });
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Could not start the party",
			);
			setBusy(false);
		}
	};

	return (
		<main className="party party--door">
			<p className="text-micro uppercase tracking-label text-ink-faint">
				Listen together
			</p>
			<h1 className="mt-3 text-display">Start a listen party</h1>
			<p className="mt-4 max-w-prose text-caption text-ink-muted">
				One queue, one clock: everyone hears the same song at the same moment,
				with the lyrics following along on every screen. Share the room link —
				nobody needs an account, and the room fades away after a quiet day.
			</p>

			<form className="party__join mt-8" onSubmit={start}>
				<label
					htmlFor="host-name"
					className="mb-2 block text-micro uppercase tracking-label text-ink-faint"
				>
					Your name at the party
				</label>
				<input
					id="host-name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					maxLength={24}
					required
					className="party__name-input px-5 py-4 text-lead"
				/>
				<button type="submit" disabled={busy} className="party__cta mt-5">
					{busy ? "Opening the room" : "Start the party"}
				</button>
				{error && <p className="mt-3 text-micro text-ink-faint">{error}</p>}
			</form>
		</main>
	);
}
