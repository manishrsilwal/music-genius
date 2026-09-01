import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import {
	CARD_SIZE,
	type CardTheme,
	type CardVariant,
	cardTypeScale,
	LOUD_MEASURE,
	themesFor,
} from "@/lib/card";
import { riseVariants, transition } from "@/lib/motion";
import type { Palette } from "@/lib/types";

import "./card-composer.scss";

interface ComposerProps {
	lines: string[];
	title: string;
	artist: string;
	palette: Palette | null;
	/** Which cut's card grammar to offer (D-132). Classic when omitted. */
	variant?: CardVariant;
	onClose: () => void;
}

/** px of the 1080 render, as cqw of the square preview — D-018's ratio. */
function cq(px: number): string {
	return `${((px / CARD_SIZE) * 100).toFixed(3)}cqw`;
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
	variant = "classic",
	onClose,
}: ComposerProps) {
	const loud = variant === "loud";
	const themes = themesFor(variant, palette);
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

	const scale = loud
		? cardTypeScale(lines, LOUD_MEASURE)
		: cardTypeScale(lines);

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
					variant,
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
				{loud ? (
					// The loud preview mirrors the loud render (D-132): same
					// 48/10/72 geometry, expressed as cqw of the square. The
					// theme paints the PANEL; the chrome re-derives from it.
					<div
						className="composer__preview"
						style={{
							background: theme.loud?.ground ?? "#fff1f2",
							padding: cq(48),
						}}
						aria-hidden="true"
					>
						<div
							style={{
								flexGrow: 1,
								display: "flex",
								flexDirection: "column",
								justifyContent: "space-between",
								background: theme.background,
								border: `${cq(10)} solid ${theme.loud?.frame ?? "#0a0a0a"}`,
								boxShadow: `${cq(18)} ${cq(18)} 0 ${theme.loud?.shadow ?? "#0a0a0a"}`,
								padding: cq(72),
							}}
						>
							<div style={{ display: "flex" }}>
								<span
									style={{
										background: theme.loud?.sticker ?? "#e11d48",
										color: theme.loud?.stickerInk ?? "#ffffff",
										border: `${cq(6)} solid ${theme.loud?.frame ?? "#0a0a0a"}`,
										boxShadow: `${cq(8)} ${cq(8)} 0 ${theme.loud?.shadow ?? "#0a0a0a"}`,
										padding: `${cq(12)} ${cq(30)}`,
										fontFamily: "var(--font-ui)",
										fontWeight: 500,
										fontSize: cq(36),
										letterSpacing: cq(7),
										textTransform: "uppercase",
										transform: "rotate(-3deg)",
									}}
								>
									Refrain
								</span>
							</div>
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
											fontWeight: 700,
											fontSize: cq(scale.size),
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
					</div>
				) : (
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
										fontSize: cq(scale.size),
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
				)}

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
						// Rendering a card is a server round-trip through satori and
						// a rasteriser. Disabled alone reads as "broken" (D-062).
						aria-busy={busy}
						className="composer__go"
					>
						{busy ? "Rendering…" : "Download card"}
					</button>
					<button type="button" onClick={onClose} className="composer__cancel">
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
