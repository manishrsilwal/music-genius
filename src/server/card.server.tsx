/**
 * Lyric Card rendering (PRD §3.4, ARCHITECTURE.md D-010).
 *
 * Satori performs real text shaping from the Rufina font binary — true kerning
 * and ligatures, crisp at any resolution. This is why the card is rendered
 * server-side rather than with html2canvas, which rasterises the DOM
 * approximately and would ship a typography product with bad typography.
 *
 * Satori accepts TTF/OTF/WOFF but NOT woff2, so the .woff variants are loaded
 * here even though browsers are served woff2.
 */

import { readFile } from "node:fs/promises";
import satori from "satori";

import { CARD_SIZE, type CardTheme, cardTypeScale } from "../lib/card";
import { getRasteriser } from "../lib/og";

const FONT_FILES = {
	display: "node_modules/@fontsource/rufina/files/rufina-latin-400-normal.woff",
	displayBold:
		"node_modules/@fontsource/rufina/files/rufina-latin-700-normal.woff",
	/**
	 * Rufina has no Devanagari at all — every such codepoint mapped to .notdef
	 * and rendered as tofu. Vesper Libre is a transitional Devanagari serif,
	 * which sits closer to Rufina's contrast than a humanist face would.
	 */
	devanagari:
		"node_modules/@fontsource/vesper-libre/files/vesper-libre-devanagari-400-normal.woff",
	ui: "node_modules/@fontsource/elms-sans/files/elms-sans-latin-500-normal.woff",
} as const;

/**
 * Satori falls back per glyph across the supplied fonts, so one line can mix
 * scripts — common in Hindi lyrics — with no script detection needed here.
 */
const DISPLAY_STACK = "Rufina, Vesper Libre";

async function loadFonts() {
	const [display, displayBold, devanagari, ui] = await Promise.all([
		readFile(FONT_FILES.display),
		readFile(FONT_FILES.displayBold),
		readFile(FONT_FILES.devanagari),
		readFile(FONT_FILES.ui),
	]);

	return [
		{
			name: "Rufina",
			data: display,
			weight: 400 as const,
			style: "normal" as const,
		},
		{
			name: "Rufina",
			data: displayBold,
			weight: 700 as const,
			style: "normal" as const,
		},
		{
			name: "Vesper Libre",
			data: devanagari,
			weight: 400 as const,
			style: "normal" as const,
		},
		{
			name: "Elms Sans",
			data: ui,
			weight: 500 as const,
			style: "normal" as const,
		},
	];
}

/** Font binaries never change; read them once per process. */
let fontCache: ReturnType<typeof loadFonts> | null = null;
function fonts() {
	if (!fontCache) fontCache = loadFonts();
	return fontCache;
}

export interface CardRequest {
	lines: string[];
	title: string;
	artist: string;
	theme: CardTheme;
}

export async function renderCard({
	lines,
	title,
	artist,
	theme,
}: CardRequest): Promise<Uint8Array> {
	const { size, leading } = cardTypeScale(lines);

	const svg = await satori(
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				width: "100%",
				height: "100%",
				padding: 104,
				background: theme.background,
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					flexGrow: 1,
				}}
			>
				{/*
				  Each line is its own element. Satori ignores "\n", and collapsing
				  lyrics into flowing prose would destroy the line structure that is
				  the writing itself.
				*/}
				{lines.map((line, index) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed, non-reordering list
						key={`${index}-${line}`}
						style={{
							display: "flex",
							fontFamily: DISPLAY_STACK,
							fontSize: size,
							lineHeight: leading,
							color: theme.ink,
							// An empty line still has to occupy its height.
							minHeight: size * leading,
						}}
					>
						{line || " "}
					</div>
				))}
			</div>

			<div
				style={{
					display: "flex",
					fontFamily: "Elms Sans",
					fontSize: 24,
					letterSpacing: 3.4,
					textTransform: "uppercase",
					color: theme.muted,
				}}
			>
				{`${title} · ${artist}`}
			</div>
		</div>,
		{ width: CARD_SIZE, height: CARD_SIZE, fonts: await fonts() },
	);

	return getRasteriser().toPng(svg, CARD_SIZE);
}
