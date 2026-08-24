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
