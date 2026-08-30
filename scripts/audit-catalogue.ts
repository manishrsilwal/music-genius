/**
 * Does every curated pick still point at the recording it claims to?
 *
 *   bun run scripts/audit-catalogue.ts
 *
 * A script rather than a test, and deliberately so: the answer lives on
 * LRCLIB, and a unit test that reaches the network is a test that fails when
 * someone else's server is slow.
 *
 * Five of the sixty entries were wrong when this was first run (OD-028) —
 * pointing at a LoFi edit, a home demo, a live cut and two trap mixes. Nothing
 * looked broken from inside the app: the page rendered, the lyrics scrolled,
 * and they were simply the wrong recording's words. Run this after adding to
 * the catalogue.
 */

import { CATALOGUE } from "../src/lib/deep-dives";
import { isVariant } from "../src/lib/ranking";
import { getTrack, searchLyrics } from "../src/server/lyrics.server";

/**
 * Variant-titled ids that are ACCEPTED, each with its reason. An entry
 * lands here only after the search for a clean alternative has been run
 * and come back empty — this is a recorded decision, not a mute button.
 * Re-audit a listed id whenever LRCLIB might have grown a better copy:
 * delete the line and run the audit.
 */
const ACCEPTED_VARIANTS: Record<string, string> = {
	// Checked 2026-08-30: LRCLIB holds NO original Kishore recording of
	// Musafir Hoon Yaaron with synced lyrics — only this "Lofi"-titled
	// upload (Kishore's own voice, and at 254s it is the Parichay
	// original's length, so the tag reads as re-upload branding), a Shaan
	// cover, and an unsynced live cut. The least-wrong pointer that
	// exists.
	"18472648": "no clean original on LRCLIB; Kishore's voice at the original's 254s",
};

let wrong = 0;
let missing = 0;

for (const entry of CATALOGUE) {
	const current = await getTrack(entry.lrclibId).catch(() => null);

	if (!current) {
		missing++;
		console.log(`GONE     ${entry.title} — ${entry.artist}  (id ${entry.lrclibId})`);
		continue;
	}

	if (!isVariant(current.title)) continue;

	const accepted = ACCEPTED_VARIANTS[entry.lrclibId];
	if (accepted) {
		console.log(`ACCEPTED ${entry.title} — ${entry.artist}  (${accepted})`);
		continue;
	}

	wrong++;
	console.log(`\nVARIANT  ${entry.title} — ${entry.artist}`);
	console.log(`  points at ${entry.lrclibId}: "${current.title}" / "${current.artist}"`);

	const options = await searchLyrics(`${entry.title} ${entry.artist}`, 6);
	const better = options.find((o) => !isVariant(o.title) && o.hasSyncedLyrics);
	console.log(
		better
			? `  suggest  ${better.id}: "${better.title}" / "${better.artist}" (${better.duration}s)`
			: `  suggest  nothing clean found — choose by hand`,
	);
}

console.log(
	`\n${CATALOGUE.length} entries · ${wrong} variant · ${missing} missing from LRCLIB`,
);
if (wrong > 0 || missing > 0) process.exitCode = 1;
