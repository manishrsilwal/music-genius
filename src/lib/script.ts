/**
 * Guess a content language from the script the lyrics are written in (D-053).
 *
 * `<html lang="en">` is a promise to assistive technology, and it is one this
 * product was breaking: it ships a Devanagari face precisely because it expects
 * Hindi lyrics (D-019), then told every screen reader those lyrics were
 * English. A speech synthesiser handed Devanagari under `lang="en"` produces
 * noise, not accented Hindi.
 *
 * **Script is not language.** Devanagari carries Hindi, Marathi, Nepali and
 * more; Han carries Chinese and Japanese. So this returns the most widely read
 * language for each script and no more — a coarse answer that is right far more
 * often than `en`, which is wrong every time. Latin is deliberately absent:
 * English, Spanish and Turkish are indistinguishable by script, and guessing
 * there would trade a correct default for a coin flip.
 */

interface ScriptRange {
	lang: string;
	test: RegExp;
}

/** Ordered by nothing in particular; every range is disjoint. */
const SCRIPTS: ScriptRange[] = [
	{ lang: "hi", test: /\p{Script=Devanagari}/u },
	{ lang: "bn", test: /\p{Script=Bengali}/u },
	{ lang: "pa", test: /\p{Script=Gurmukhi}/u },
	{ lang: "gu", test: /\p{Script=Gujarati}/u },
	{ lang: "ta", test: /\p{Script=Tamil}/u },
	{ lang: "te", test: /\p{Script=Telugu}/u },
	{ lang: "kn", test: /\p{Script=Kannada}/u },
	{ lang: "ml", test: /\p{Script=Malayalam}/u },
	{ lang: "ar", test: /\p{Script=Arabic}/u },
	{ lang: "he", test: /\p{Script=Hebrew}/u },
	{ lang: "th", test: /\p{Script=Thai}/u },
	{ lang: "ko", test: /\p{Script=Hangul}/u },
	{ lang: "el", test: /\p{Script=Greek}/u },
	{ lang: "ru", test: /\p{Script=Cyrillic}/u },
];

/**
 * A transliterated line or a borrowed word should not flip the whole page, so
 * a script has to carry a real share of the letters before it counts.
 */
const MIN_SHARE = 0.2;

/** Letters only: punctuation, digits and whitespace say nothing about script. */
const LETTERS = /\p{L}/gu;

/**
 * Han and kana are handled apart from the table, because counting them
 * separately gets Japanese wrong.
 *
 * Japanese prose is usually majority-Han with kana carrying the particles, so
 * whichever has more characters is not the question — the question is whether
 * any kana appear at all. They are exclusive to Japanese, so one settles it,
 * and the two scripts are then weighed together as a single share.
 */
const HAN = /\p{Script=Han}/gu;
const KANA = /\p{Script=Hiragana}|\p{Script=Katakana}/gu;

/**
 * Every tag `detectLang` is capable of returning.
 *
 * Exported so the font tables can be asserted against it (D-057). Adding a
 * script above without adding a face for it is a silent regression: the page
 * still labels the language correctly and then renders it as boxes, which is
 * the exact shape of the bug OD-017 described.
 */
export const DETECTABLE_LANGS: readonly string[] = [
	"ja",
	"zh",
	...SCRIPTS.map((script) => script.lang),
];

/**
 * Returns a BCP-47 tag, or null when the text is Latin, empty, or too mixed to
 * call. Null means "leave the document's own lang alone".
 */
export function detectLang(text: string): string | null {
	const letters = text.match(LETTERS);
	if (!letters || letters.length === 0) return null;

	let best: { lang: string; count: number } | null = null;

	const han = (text.match(new RegExp(HAN.source, "gu")) ?? []).length;
	const kana = (text.match(new RegExp(KANA.source, "gu")) ?? []).length;
	if (han + kana > 0) {
		best = { lang: kana > 0 ? "ja" : "zh", count: han + kana };
	}

	for (const { lang, test } of SCRIPTS) {
		// Rebuilt per script with the global flag, so `lastIndex` from one test
		// can never carry into the next.
		const matcher = new RegExp(test.source, "gu");
		const count = (text.match(matcher) ?? []).length;
		if (count > 0 && (!best || count > best.count)) best = { lang, count };
	}

	if (!best) return null;
	return best.count / letters.length >= MIN_SHARE ? best.lang : null;
}
