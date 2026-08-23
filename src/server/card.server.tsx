/**
 * Lyric Card rendering (PRD §3.4, ARCHITECTURE.md D-010).
 *
 * Satori performs real text shaping from the display font binary — true kerning
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
import { detectLang } from "../lib/script";
import {
	BASE_FONTS,
	CJK_FAMILY,
	CJK_FONTS,
	SCRIPT_FONTS,
} from "./fonts.server";

/**
 * Satori falls back per glyph across the supplied fonts, so one line can mix
 * scripts — common in Hindi lyrics — with no script detection needed. The
 * ordering among companions is irrelevant because their scripts are disjoint;
 * the CJK face is appended per render, since that one is not.
 */
const DISPLAY_STACK = ["Fraunces", ...Object.keys(SCRIPT_FONTS)].join(", ");

type LoadedFont = {
	name: string;
	data: Buffer;
	weight: 400 | 500 | 700;
	style: "normal";
};

async function loadFonts(): Promise<LoadedFont[]> {
	const [display, displayBold, ui] = await Promise.all([
		readFile(BASE_FONTS.display),
		readFile(BASE_FONTS.displayBold),
		readFile(BASE_FONTS.ui),
	]);

	const scripts = await Promise.all(
		Object.entries(SCRIPT_FONTS).map(async ([name, file]) => ({
			name,
			data: await readFile(file),
			weight: 400 as const,
			style: "normal" as const,
		})),
	);

	return [
		{ name: "Fraunces", data: display, weight: 400, style: "normal" },
		{ name: "Fraunces", data: displayBold, weight: 700, style: "normal" },
		...scripts,
		{ name: "Outfit", data: ui, weight: 500, style: "normal" },
	];
}

/** Read once per process, per CJK language actually asked for. */
const cjkCache = new Map<string, Promise<LoadedFont>>();

function cjkFont(lang: string): Promise<LoadedFont> | null {
	const file = CJK_FONTS[lang];
	const name = CJK_FAMILY[lang];
	if (!file || !name) return null;

	let entry = cjkCache.get(lang);
	if (!entry) {
		entry = readFile(file).then((data) => ({
			name,
			data,
			weight: 400 as const,
			style: "normal" as const,
		}));
		cjkCache.set(lang, entry);
	}
	return entry;
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

	// Same detector the document's `lang` attribute uses (D-053), so the card
	// and the page it was exported from resolve Han to the same regional
	// shapes. Returns null for Latin, which is the common case and loads
	// nothing.
	const lang = detectLang(lines.join("\n"));
	const cjk = lang ? cjkFont(lang) : null;
	const loaded = cjk ? await cjk : null;

	const fontFamily = loaded
		? `${DISPLAY_STACK}, ${loaded.name}`
		: DISPLAY_STACK;

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
							fontFamily,
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
					fontFamily: "Outfit",
					fontSize: 24,
					letterSpacing: 3.4,
					textTransform: "uppercase",
					color: theme.muted,
				}}
			>
				{`${title} · ${artist}`}
			</div>
		</div>,
		{
			width: CARD_SIZE,
			height: CARD_SIZE,
			fonts: loaded ? [...(await fonts()), loaded] : await fonts(),
		},
	);

	return getRasteriser().toPng(svg, CARD_SIZE);
}
