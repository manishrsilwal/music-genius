/**
 * Which typeface covers which script (D-019, extended in D-057).
 *
 * Separated from card.server.tsx so the tables can be asserted against the
 * filesystem without importing satori and the native rasteriser. Every path
 * here is typed by hand, and a wrong one fails only when a reader exports a
 * card in that script — which is to say, in production, for the one reader
 * least likely to report it. fonts.test.ts checks all of them.
 */

export const FONT_DIR = "node_modules/@fontsource";

/**
 * Always loaded: Latin display, Latin UI, and the bold cut the title uses.
 */
export const BASE_FONTS = {
	// The STATIC cut, not the variable one the browser gets: satori parses
	// woff and ttf, never woff2, and the variable builds ship nothing else
	// (D-064).
	display: `${FONT_DIR}/fraunces/files/fraunces-latin-400-normal.woff`,
	displayBold: `${FONT_DIR}/fraunces/files/fraunces-latin-700-normal.woff`,
	ui: `${FONT_DIR}/outfit/files/outfit-latin-500-normal.woff`,
} as const;

/**
 * One companion face per script, keyed by the family name Satori will be asked
 * for (D-019, extended in D-057).
 *
 * The display face covers latin and latin-ext and nothing else. On the web an uncovered
 * script at least reaches the OS; Satori has no system fonts, so anything
 * missing here rendered as literal tofu boxes on the exported card — verified
 * by rendering one before this change.
 *
 * These are small — 12KB to 140KB each — so all of them load together. The CJK
 * three below are a different matter and do not.
 */
export const SCRIPT_FONTS: Record<string, string> = {
	"Vesper Libre": `${FONT_DIR}/vesper-libre/files/vesper-libre-devanagari-400-normal.woff`,
	Amiri: `${FONT_DIR}/amiri/files/amiri-arabic-400-normal.woff`,
	"Noto Serif Bengali": `${FONT_DIR}/noto-serif-bengali/files/noto-serif-bengali-bengali-400-normal.woff`,
	"Noto Serif Gurmukhi": `${FONT_DIR}/noto-serif-gurmukhi/files/noto-serif-gurmukhi-gurmukhi-400-normal.woff`,
	"Noto Serif Gujarati": `${FONT_DIR}/noto-serif-gujarati/files/noto-serif-gujarati-gujarati-400-normal.woff`,
	"Noto Serif Tamil": `${FONT_DIR}/noto-serif-tamil/files/noto-serif-tamil-tamil-400-normal.woff`,
	"Noto Serif Telugu": `${FONT_DIR}/noto-serif-telugu/files/noto-serif-telugu-telugu-400-normal.woff`,
	"Noto Serif Kannada": `${FONT_DIR}/noto-serif-kannada/files/noto-serif-kannada-kannada-400-normal.woff`,
	"Noto Serif Malayalam": `${FONT_DIR}/noto-serif-malayalam/files/noto-serif-malayalam-malayalam-400-normal.woff`,
	"Noto Serif Thai": `${FONT_DIR}/noto-serif-thai/files/noto-serif-thai-thai-400-normal.woff`,
	"Noto Serif Hebrew": `${FONT_DIR}/noto-serif-hebrew/files/noto-serif-hebrew-hebrew-400-normal.woff`,
	// Cyrillic and Greek: the display face stops at latin-ext, so these were
	// tofu too.
	"Noto Serif": `${FONT_DIR}/noto-serif/files/noto-serif-cyrillic-400-normal.woff`,
	"Noto Serif Greek": `${FONT_DIR}/noto-serif/files/noto-serif-greek-400-normal.woff`,
};

/**
 * CJK, loaded only when the card's own text needs it.
 *
 * Two reasons this is not in the table above. First size: these are 1.8MB to
 * 2.3MB each as .woff against 12–140KB for everything else, and holding all
 * three costs ~6MB of resident memory for a route most cards never take.
 * Second correctness: Japanese, Chinese and Korean share U+4E00-9FFF and draw
 * those codepoints differently, so handing Satori all three at once would let
 * whichever came first in the stack claim every Han glyph — a Chinese lyric
 * silently set in Japanese shapes. Picking one by language is both cheaper and
 * the only correct answer.
 */
export const CJK_FONTS: Record<string, string> = {
	ja: `${FONT_DIR}/noto-serif-jp/files/noto-serif-jp-japanese-400-normal.woff`,
	zh: `${FONT_DIR}/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff`,
	ko: `${FONT_DIR}/noto-serif-kr/files/noto-serif-kr-korean-400-normal.woff`,
};

export const CJK_FAMILY: Record<string, string> = {
	ja: "Noto Serif JP",
	zh: "Noto Serif SC",
	ko: "Noto Serif KR",
};

/**
 * Satori falls back per glyph across the supplied fonts, so one line can mix
 * scripts — common in Hindi lyrics — with no script detection needed. The
 * ordering among companions is irrelevant because their scripts are disjoint;
 * the CJK face is appended per render, since that one is not.
 */
