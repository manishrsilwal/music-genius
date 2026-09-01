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

import {
	CARD_DIMS,
	CARD_SIZE,
	type CardFormat,
	type CardTheme,
	type CardVariant,
	cardMeasure,
	cardTypeScale,
	loudTypeScale,
} from "../lib/card";
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

/**
 * The loud card's line stack (D-132): Epilogue first — the v2 reading
 * page's own face — then the same script companions, because a lyric line
 * mixes scripts on the loud cut exactly as it does on the classic.
 */
const LOUD_STACK = ["Epilogue", ...Object.keys(SCRIPT_FONTS)].join(", ");

type LoadedFont = {
	name: string;
	data: Buffer;
	weight: 400 | 500 | 700;
	style: "normal";
};

async function loadFonts(): Promise<LoadedFont[]> {
	const [display, displayBold, ui, loudDisplay, loudText, loudTextMedium] =
		await Promise.all([
			readFile(BASE_FONTS.display),
			readFile(BASE_FONTS.displayBold),
			readFile(BASE_FONTS.ui),
			readFile(BASE_FONTS.loudDisplay),
			readFile(BASE_FONTS.loudText),
			readFile(BASE_FONTS.loudTextMedium),
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
		{ name: "Anton", data: loudDisplay, weight: 400, style: "normal" },
		{ name: "Epilogue", data: loudText, weight: 700, style: "normal" },
		{ name: "Epilogue", data: loudTextMedium, weight: 500, style: "normal" },
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
	/** Which cut's grammar the card wears (D-132). Classic when omitted. */
	variant?: CardVariant;
	/** Square for feeds, story for the 9:16 canvas. Square when omitted. */
	format?: CardFormat;
}

export async function renderCard({
	lines,
	title,
	artist,
	theme,
	variant = "classic",
	format = "square",
}: CardRequest): Promise<Uint8Array> {
	const loud = variant === "loud";
	const dims = CARD_DIMS[format];
	// The loud card wraps and the classic never does (D-132): two scales,
	// each shared verbatim with its preview.
	const { size, leading } = loud
		? loudTypeScale(lines, cardMeasure("loud", format))
		: cardTypeScale(lines, cardMeasure("classic", format));

	// Same detector the document's `lang` attribute uses (D-053), so the card
	// and the page it was exported from resolve Han to the same regional
	// shapes. Returns null for Latin, which is the common case and loads
	// nothing.
	const lang = detectLang(lines.join("\n"));
	const cjk = lang ? cjkFont(lang) : null;
	const loaded = cjk ? await cjk : null;

	const stack = loud ? LOUD_STACK : DISPLAY_STACK;
	const fontFamily = loaded ? `${stack}, ${loaded.name}` : stack;

	/*
	 * The lyric block, shared by both grammars: each line its own element —
	 * Satori ignores "\n", and collapsing lyrics into flowing prose would
	 * destroy the line structure that is the writing itself. The loud cut
	 * sets the lines bold; the classic keeps the book weight.
	 */
	const lyricBlock = (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				flexGrow: 1,
			}}
		>
			{lines.map((line, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed, non-reordering list
					key={`${index}-${line}`}
					style={{
						display: "flex",
						fontFamily,
						fontWeight: loud ? 700 : 400,
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
	);

	const credit = (
		<div
			style={{
				display: "flex",
				fontFamily: loud ? "Epilogue" : "Outfit",
				fontWeight: 500,
				fontSize: 24,
				letterSpacing: 3.4,
				textTransform: "uppercase",
				color: theme.muted,
			}}
		>
			{`${title} · ${artist}`}
		</div>
	);

	/*
	 * The loud card (D-132, recut on the owner's second ruling): the theme
	 * paints the PANEL — the card's own body — and the ink, credit and
	 * sticker come re-derived from the same theme; the ground under it is
	 * the product's constant warm canvas. The geometry (48 margin + 10
	 * border + 72 padding) is what LOUD_MEASURE prices.
	 */
	const chrome = theme.loud ?? {
		ground: "#fff1f2",
		frame: "#0a0a0a",
		shadow: "#0a0a0a",
		sticker: "#e11d48",
		stickerInk: "#ffffff",
	};
	const loudCard = (
		<div
			style={{
				display: "flex",
				width: "100%",
				height: "100%",
				padding: 48,
				background: chrome.ground,
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					flexGrow: 1,
					background: theme.background,
					border: `10px solid ${chrome.frame}`,
					boxShadow: `18px 18px 0 ${chrome.shadow}`,
					padding: 72,
				}}
			>
				<div style={{ display: "flex" }}>
					<div
						style={{
							display: "flex",
							background: chrome.sticker,
							color: chrome.stickerInk,
							border: `6px solid ${chrome.frame}`,
							boxShadow: `8px 8px 0 ${chrome.shadow}`,
							padding: "12px 30px",
							// The brand speaks Anton — the loud cut's own logo face.
							fontFamily: "Anton",
							fontSize: 40,
							fontWeight: 400,
							letterSpacing: 4,
							textTransform: "uppercase",
							transform: "rotate(-3deg)",
						}}
					>
						Refrain
					</div>
				</div>
				{lyricBlock}
				{credit}
			</div>
		</div>
	);

	const svg = await satori(
		loud ? (
			loudCard
		) : (
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
				{lyricBlock}
				{credit}
			</div>
		),
		{
			width: dims.width,
			height: dims.height,
			fonts: loaded ? [...(await fonts()), loaded] : await fonts(),
		},
	);

	// fitTo width: the height follows the SVG's own aspect, so the story's
	// 1920 comes along without a second knob.
	return getRasteriser().toPng(svg, CARD_SIZE);
}
