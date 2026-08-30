import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
	readStoredName,
	storeName,
	storeSession,
} from "@/features/party/hooks/use-party";

/**
 * v2 party lobby (D-125): start a room or paste a code. Same wire, same
 * rooms as v1's parties — a friend on v1 and a friend on v2 land in the
 * same session; only the room they see is dressed differently.
 */

export const Route = createFileRoute("/v2/party/")({
	head: () => ({ meta: [{ title: "Listen party — Refrain v2" }] }),
	component: PartyLobbyV2,
});

function PartyLobbyV2() {
	const navigate = useNavigate();
	const [name, setName] = useState(() =>
		typeof window === "undefined" ? "" : readStoredName(),
	);
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function create(event: React.FormEvent) {
		event.preventDefault();
		if (busy || !name.trim()) return;
		setBusy(true);
		setError(null);
		try {
			const response = await fetch("/api/party", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "create", name: name.trim() }),
			});
			const payload = (await response.json()) as {
				roomId?: string;
				memberId?: string;
				hostKey?: string;
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
			navigate({ to: "/v2/party/$roomId", params: { roomId: payload.roomId } });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Something slipped");
			setBusy(false);
		}
	}

	function joinByCode(event: React.FormEvent) {
		event.preventDefault();
		const trimmed = code.trim();
		if (!trimmed) return;
		navigate({ to: "/v2/party/$roomId", params: { roomId: trimmed } });
	}

	return (
		<main className="v2party">
			<h1 className="v2party__title">
				Same song. <em>Same second.</em> Everyone.
			</h1>

			<div className="v2party__grid">
				<section className="v2party__panel">
					<h2 className="v2party__chat-title">Start a party</h2>
					<form className="v2party__form" onSubmit={create}>
						<input
							className="v2party__field"
							value={name}
							maxLength={24}
							placeholder="Your name at the party"
							aria-label="Your name"
							onChange={(event) => setName(event.target.value)}
						/>
						<button
							type="submit"
							className="v2party__ctl"
							disabled={busy || !name.trim()}
						>
							{busy ? "Opening the room…" : "Let's go"}
						</button>
						{error && <p className="v2party__hint">{error}</p>}
					</form>
				</section>

				<section className="v2party__panel">
					<h2 className="v2party__chat-title">Got a code?</h2>
					<form className="v2party__form" onSubmit={joinByCode}>
						<input
							className="v2party__field"
							value={code}
							placeholder="Paste the room code"
							aria-label="Room code"
							onChange={(event) => setCode(event.target.value)}
						/>
						<button
							type="submit"
							className="v2party__ctl"
							data-quiet
							disabled={!code.trim()}
						>
							Join in
						</button>
					</form>
				</section>
			</div>
		</main>
	);
}
