import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import {
	CARD_SIZE,
	type CardTheme,
	cardThemes,
	cardTypeScale,
} from "@/lib/card";
import { riseVariants, transition } from "@/lib/motion";
import type { Palette } from "@/lib/types";

import "./card-composer.scss";

interface ComposerProps {
	lines: string[];
	title: string;
	artist: string;
	palette: Palette | null;
	onClose: () => void;
}

/**
 * Card composer (PRD §3.4).
 *
 * The preview is built from the very same theme strings the server renders
 * from, with type sized as a percentage of the 1080px card. What the reader
 * approves is what the file contains (D-018).
 */
export function CardComposer({
	lines,
	title,
	artist,
	palette,
	onClose,
}: ComposerProps) {
	const themes = cardThemes(palette);
	const [theme, setTheme] = useState<CardTheme>(themes[0] as CardTheme);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Escape closes: this is a modal over the reader's place in the song.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [onClose]);

	const scale = cardTypeScale(lines);

	async function download() {
		setBusy(true);
		setError(null);
		try {
			const response = await fetch("/api/card", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					lines,
					title,
					artist,
					themeId: theme.id,
					palette,
				}),
			});
			if (!response.ok) throw new Error("Render failed");

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-lyric-card.png`;
			anchor.click();
			// Revoke on the next tick; revoking synchronously can cancel the save.
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch {
			setError("Could not create the card. Try again.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<motion.div
			className="composer"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={transition.quick}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: scrim dismiss, Escape also bound */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled at document level */}
			<div className="composer__scrim" onClick={onClose} />

			<motion.div
				className="composer__panel"
				role="dialog"
				aria-modal="true"
				aria-label="Create a lyric card"
				variants={riseVariants}
				initial="hidden"
				animate="visible"
			>
				<div
					className="composer__preview"
					style={{ background: theme.background }}
					// The preview is a picture of the export, not content to read twice.
					aria-hidden="true"
				>
					<div
						style={{
							flexGrow: 1,
							display: "flex",
							flexDirection: "column",
							justifyContent: "center",
						}}
					>
						{lines.map((line, index) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: fixed, non-reordering list
								key={`${index}-${line}`}
								className="composer__line"
								style={{
									color: theme.ink,
									// cqw = percent of the preview's width, matching the 1080px render.
									fontSize: `${((scale.size / CARD_SIZE) * 100).toFixed(3)}cqw`,
									lineHeight: scale.leading,
								}}
							>
								{line}
							</span>
						))}
					</div>
					<span className="composer__credit" style={{ color: theme.muted }}>
						{title} · {artist}
					</span>
				</div>

				<div>
					<p className="mb-3 text-micro uppercase tracking-label text-ink-faint">
						Treatment
					</p>
					<div className="composer__themes">
						{themes.map((option) => (
							<button
								key={option.id}
								type="button"
								aria-pressed={option.id === theme.id}
								aria-label={option.label}
								title={option.label}
								onClick={() => setTheme(option)}
								className="composer__swatch"
								style={{ background: option.background }}
							/>
						))}
					</div>
				</div>

				{error && <p className="text-caption text-accent">{error}</p>}

				<div className="composer__actions">
					<button
						type="button"
						onClick={download}
						disabled={busy}
						className="flex-1 rounded-card bg-accent px-5 py-3 font-ui text-caption uppercase tracking-label text-canvas disabled:opacity-60"
					>
						{busy ? "Rendering…" : "Download card"}
					</button>
					<button
						type="button"
						onClick={onClose}
						className="rounded-card border border-hairline px-5 py-3 font-ui text-caption uppercase tracking-label text-ink-muted"
					>
						Cancel
					</button>
				</div>
			</motion.div>
		</motion.div>
	);
}

/** The tooltip that appears over a selection (PRD §3.4). */
export function SelectionTooltip({
	rect,
	count,
	onCreate,
}: {
	rect: DOMRect;
	count: number;
	onCreate: () => void;
}) {
	return (
		<AnimatePresence>
			<motion.button
				type="button"
				className="card-tip px-4 py-2 text-caption"
				style={{ left: rect.left + rect.width / 2, top: rect.top - 10 }}
				onClick={onCreate}
				initial={{ opacity: 0, y: 6, scale: 0.96 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: 6, scale: 0.96 }}
				transition={transition.quick}
			>
				Create card · {count} {count === 1 ? "line" : "lines"}
			</motion.button>
		</AnimatePresence>
	);
}
