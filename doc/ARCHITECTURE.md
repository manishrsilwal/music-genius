# Architecture — Typographic Lyrical Explorer

> Design conventions — type, colour, layering, motion, interaction —
> live in [DESIGN.md](./DESIGN.md).

Living decision record. Every architectural, API, and state-management decision is
logged here with its rationale and its rejected alternatives.

**Rule:** nothing is decided by assumption. Anything unresolved lives in
[Deferred Decisions](#deferred-decisions) until explicitly ruled on.

- **Status:** Block 5 — all PRD features implemented. Insights run on DeepSeek, verified against live output (D-050)
- **Previously:** Block 3 complete — Lyric Card export shipping; selection → composer → PNG verified
- **Last updated:** 2026-08-22
- **Source of truth:** `prd-doc/Typographic_Lyrical_Explorer_PRD_v2.pdf` (v2.0)

---

## 1. Product Shape

Lyrics as a premium editorial reading experience. Five surfaces:

| Surface | Core mechanic | PRD |
|---|---|---|
| Discovery | Curated "Today's Deep Dives" + instant autocomplete w/ album-art thumbs | §3.1 |
| Immersive hero | Full-bleed blurred art, massive serif title, glassmorphic play | §3.2 |
| Scrollytelling canvas | Center stanza opaque, neighbours → 20%, annotated phrases glow | §3.3 |
| Lyric Cards | Select 2–4 lines → typographic image export | §3.4 |
| Insights drawer | Desktop side panel / mobile bottom sheet @ 50% | §3.5 |

Two-speed data model (§4): lyrics must be instant (<500ms, cached); AI insights
take 3–6s and must **never** block reading.

---

## 2. Decision Log

### D-001 — Framework: TanStack Start
**Decided 2026-08-21.** TanStack Start `1.168` + TanStack Router `1.170`, React 19, Vite 8.

Next.js 16 was evaluated first and initially recommended, on the strength of
`next/og` and `next/font`. Investigation showed both advantages were weaker than assumed:

- `next/og` is a wrapper around Satori — installable directly as `satori` + a rasteriser.
- `next/font` is replaceable by Fontsource, which ships **real self-hosted woff2 files**.
  For a typography-led product, owning the font files outright is preferable to build-time magic.

With those neutralised, TanStack Start wins on the properties this app actually needs:
Vite HMR (the app is ~85% client-interactive and will be tuned by feel), no RSC
`"use client"` boundary tax, no App Router implicit-cache footguns, end-to-end type-safe routing.

**Rejected:** Next.js 16 (RSC tax for little benefit here); Astro (islands advantage
evaporates when the whole page is interactive, cross-island motion state is painful);
Vite SPA + Hono (no SSR ⇒ dead link previews, contradicts the virality metric);
Remix/React Router 8 (same rebuild gaps, without the DX upside);
SvelteKit / Nuxt (eliminated — `motion` is React-only).

> Note: `create-start-app` is **deprecated**. Scaffold via `tanstack create`
> (`@tanstack/cli`). Most online tutorials still show the dead command.

### D-002 — Language: TypeScript, strict
**Decided 2026-08-21.** Plus `noUncheckedIndexedAccess`.

Three external API shapes (LRCLIB synced-lyric timestamp arrays, Genius metadata,
LLM insight payloads) plus stanza-index math in the scroll-spy. Unchecked indexed
access is precisely where scroll-spy bugs would live.

### D-003 — Styling: Tailwind CSS v4
**Decided 2026-08-21.** `tailwindcss` + `@tailwindcss/vite` `4.3`.

CSS-first `@theme` config means design tokens *are* CSS custom properties. This is a
hard requirement, not a preference: the album-art palette must reassign the theme at
runtime per track. `--track-accent` is declared as an indirection so palette extraction
can repaint the page without a React re-render.

**Rejected:** Tailwind v3.4 — runtime palette swapping needs a hand-maintained bridge layer.

### D-004 — Animation: `motion` v13
**Decided 2026-08-21.** Imported from `motion/react`.

The current, actively developed package. `framer-motion` v11 is the legacy name in
maintenance mode — starting there means starting deprecated.

All easing curves, durations, and shared variants live in `src/lib/motion.ts`.
**No magic numbers in components.** A `prefers-reduced-motion` bridge degrades
time-synced auto-scroll to instant jumps rather than disabling it.

### D-005 — Typography: Rufina + Elms Sans
**Decided 2026-08-21.** Self-hosted via `@fontsource/rufina` and `@fontsource-variable/elms-sans`.

Verified against the live Google Fonts API:

| Face | Role | Weights | Variable | Italic |
|---|---|---|---|---|
| Rufina | Display / hero / lyric canvas | 400, 700 | No | **None** |
| Elms Sans | UI chrome | 100–900 | Yes | Yes |

Type scale is fluid `clamp()` tokens in the `@theme` layer.

**Constraint:** Rufina has no italic. Faux-oblique synthesis is **forbidden** — it shears
the letterforms and is unacceptable at pull-quote size. See [OD-006](#deferred-decisions).

### D-006 — Package manager: bun
**Decided 2026-08-21.** Lockfile committed.

### D-007 — Data layer: Router loaders + TanStack Query
**Decided 2026-08-21.** `@tanstack/react-query` `5.101`.

Maps directly onto the PRD's two-speed model:

- **Router loaders** SSR the track + lyrics — fast first paint, SEO, correct link previews.
- **TanStack Query** owns `/api/insights` — retry, stale handling, and the
  shimmer-until-ready transition come for free rather than hand-rolled.

**Rejected:** loaders alone (hand-rolled deferred state machine).

### D-008 — Toolchain: Biome
**Decided 2026-08-21.** Single Rust binary for lint + format.

### D-009 — Deployment: deferred, abstracted
**Decided 2026-08-21.** Build against the Nitro `node-server` preset. Target chosen later.

This decision has a consequence: **two** subsystems fork on runtime and must therefore
sit behind interfaces from day one.

| Subsystem | Why it forks | Abstraction |
|---|---|---|
| Card rasteriser | `@resvg/resvg-js` is a native binary — will not run on Cloudflare Workers, which needs `@resvg/resvg-wasm` (~2MB, slower cold start) | `src/lib/og.ts` |
| Cache | Vercel KV / Cloudflare KV / Redis have different clients | `src/lib/cache.ts` |

Switching target later must be a one-file change per subsystem.
`@upstash/redis` is the likely default — HTTP-based, so it works on every runtime.

> **Risk:** the scaffolder pinned `nitro@3.0.260610-beta`. A beta server runtime
> underpins the whole deployment story. Watch for a stable 3.x before launch.

### D-087 — Say how to cache the document; never let a browser keep JSON for a month
**Built 2026-08-25.** The owner's report: after a long time away, hitting the
URL serves a stale app until a hard refresh. Measured, two holes, both ours:

**The HTML documents carried no Cache-Control at all.** Whatever stored a
copy — a browser's session restore, any proxy or CDN once this deploys —
kept its references to hashed asset files, which a rebuild deletes; the
stale shell then loads against assets that no longer exist, and only a hard
refresh recovers. The documents now say `no-cache` (store, but revalidate —
a few kilobytes per visit) via Nitro routeRules, verified in dev and in the
built server. Scoped to `/` and `/track/**`, NOT `/**`: measured, a
routeRules header **overrides** a handler's own Cache-Control in this Nitro,
so the blanket rule silently flattened every /api policy (card's no-store,
og's immutable) to no-cache. The assets rule restates the default
year-immutable so nothing can erode it — hashed filenames are their own
version stamp.

**/api/track, /api/artwork and /api/insights told the browser to keep JSON
for 30 days** — track marked `immutable`. The 30 days is right for caches we
control; it is wrong for the one cache nothing can purge. This response's
shape has changed twice (track:v2→v3), and the server-side version bump that
fixed it cannot touch a copy a reader's browser kept — month-old JSON meeting
this week's code is the same bug D-077's cache comment predicted, waiting
client-side. Now `max-age=3600, s-maxage=${TTL.track}`: browsers one hour,
CDNs the month. `/api/og` keeps its long TTL (image bytes have no shape to
drift) and `/api/card` keeps no-store.

One caveat stated rather than hidden: if the owner's symptom came from a
long-idle dev server rather than a stored document, these headers make the
browser side honest but a wedged dev process still wants its restart.

### D-086 — The mark is a signature, not a button
**Built 2026-08-25.** The owner's read on the remaining pages: boxed in a
pill, the logo read as a control — chrome promising an action, when it is an
identity. The pill was not a whim; D-065 gave the mark a solid surface
because it floated over full-bleed album art, a ground whose contrast was
unknowable. D-084 removed the masthead from the track page, and everywhere it
still renders the ground is the flat canvas — measurable, and fine. The
justification left; the box had stayed out of habit.

Now: no surface, no border, no shadow, no padding — the mark and wordmark sit
directly on the layout's inset, hover shifts colour only (a hover that paints
a box back on would give back what the removal took away), and the
`tap-target` mixin still guarantees the 44px hit area the padding used to.
`--masthead-height` is still the height contract (D-060).

Removing the box exposed a bug it had been hiding: the skip-link tucks above
the viewport by a few pixels, but its `--shadow-2` reached past its element
into the corner — a dark sliver that had always been there, invisible only
while the pill sat on top of it. The shadow now arrives with focus.

### D-085 — Sync says its state with motion
**Built 2026-08-25.** The owner's screenshot made the case: with the song
playing, the Sync pill was filled — the "following" state — and still
unreadable, because the play toggle beside it is also a filled accent shape.
In a row of filled controls, "filled = on" reads as "another button", not as
a state. Fill was the wrong channel; every neighbour can counterfeit it.

The pill now carries a three-bar equaliser that steps while the canvas is
actually following the song and freezes when it is not. Movement is the one
cue nothing else on the row has, and it is the honest one — the bars move
exactly when the lyrics do. Off is a frozen unequal wave rather than a flat
line: three equal stubs on the baseline read as an ellipsis ("loading"),
where a stopped wave reads as a wave, stopped. Under reduced motion the two
states stay readable statically — tall bars for following, the short frozen
wave for not. The glyph is `aria-hidden`; `aria-pressed` was already telling
assistive tech the same fact.

### D-084 — The track page is a sheet
**Built 2026-08-25.** Three owner calls that turn out to be one idea: the
story button joins the rail, the masthead yields to a cross, and the page
itself pushes up like a scaffold when a song is opened.

**"Discover the story" is in the rail from `lg`** — under the transport, on
the player's 26rem measure, so the rail reads as one instrument and the
lyrics column carries nothing but lyrics. Below `lg` it stays fixed (owner's
pick from two options): on a phone the column scrolls away, and the one
feature the product is named after must not scroll away with it. DOM-wise the
button now lives in the hero's `discover` slot everywhere — CSS parts its
visual position from its DOM position below `lg`, deliberately. The
`InsightsAffordance` wrapper died of this: with the button in the hero's
subtree and the drawer at shell level, the state they share moved up to the
route, and a component whose whole job was co-locating them had no job.

**The push (the scaffold effect).** The shell is a `motion.article`: it
enters at `y: 100dvh` and rises on `transition.sheet` — the drawer's own
spring, so opening a song and opening its story are one physical gesture at
two scales. The cross (top-right, owner's pick; styled as the masthead's
surface on the opposite shoulder) reverses the spring and navigates home when
the sheet lands. Measured: mount at 844px down, 844→372→95→23→5→0 in ~500ms;
dismiss 0→842 then the URL flips at ~600ms.

Three traps, all found by measurement rather than review:
- **Reduced motion lives in the transition, not the keys.** The server cannot
  know the preference, so it always renders the pushed-down initial; a client
  that then animates `opacity` instead of `y` never manages the SSR transform
  and the page stays stranded a viewport down — the first cut failed exactly
  this way under the harness's reduced-motion profile. Same keys everywhere;
  the preference collapses the sweep to a cut.
- **Mid-transform, the shell is the containing block for its own fixed
  chrome.** The phone's pill would measure `bottom` from the article's foot —
  several viewports down — and pop in from the wrong place when the transform
  clears. `data-entering` holds it invisible until the sheet lands.
- **`justify-center` clips overflow at an unreachable top.** The rail column
  got taller and a three-line title on a short laptop overruns 100dvh; the
  hero now scrolls internally, and auto block margins centre the lockup only
  when there is room (`safe center` semantics, wider support).

**The masthead is not on the track page** — the one deliberate reversal of
D-059's "every page". The way home IS the dismissal now, and two home
affordances in two corners is chrome noise on a reading page. Everywhere
else (landing, 404, error) the guarantee stands. The rail also trades the
fixed 15rem disc for `min(15rem, 24dvh)`: same size on a tall display, and
on a short one the art gives the room back before any control does.

### D-083 — Disc on the centreline, kicker retired
**Built 2026-08-25.** Two owner calls on D-082's player screen. The rail's
disc moves to the centreline — left-set it read as a list item above the
title; centred over left-set words is the reference's own composition, and
the axis a spinning record already implies. Only the `lg` lockup changes:
`justify-items: center`, and the full-width text block keeps the words left.

And the "Time-synced" kicker is gone. It earned its slot when nothing else on
the page said whether timings existed; the Sync button now renders exactly
when they do (D-080), and the "No timings" notice speaks when they don't. A
label restating what a control already shows is the record redundancy again,
one line smaller. Its alternate reading, "Lyrics", said even less.

### D-082 — The player screen's grammar
**Built 2026-08-25.** The owner brought a reference (a dark neon mobile
player) with the note that the design was "all over the place", and asked for
a modern player UI in the left column, loading first on a phone with the
lyrics arriving on scroll. The skin stays ours — cream, Fraunces, the track's
own accent (the D-074 study's conclusion holds) — what the reference
contributes is its **grammar**: art, then words, then the line, then one big
control on the centreline.

**The undocked bar reads top to bottom now.** The old grid was a docked bar's
furniture without its bar — play at one edge, video at the other, the scrub
bolted underneath. The new template is `scrub / sync·toggle·video / meta`:
the seekbar with its times first, then a transport row whose columns are
`1fr auto 1fr` so play sits on the true centreline whatever the sync pill and
the video box weigh, then the status line as a centred caption. Play grows to
3.25rem undocked — the reference's one big filled control; the ui-ux database
has no player-layout pattern (checked, as with the split view), but its 44px
touch minimum is what the size clears. When playback has failed the
"elsewhere" link takes the empty centre slot. The meta line renders only when
it has something to say — an empty span still owns a grid row, and its gap
pushed the transport around whenever a notice appeared.

**The art leads where there is a screen to lead.** The phone disc grows from
24vw to 38vw — the widest that still leaves title, credit and transport
inside one viewport. Two short-viewport rules keep the 667px phone honest,
both found by screenshot: the small disc returns below 44rem, and the hero
reserves the drawer pill's fixed zone with bottom padding — the taller player
column ran underneath it, transport row first.

**"Loads first on mobile" was already true** — the hero is `min-h-dvh`, so
the first paint is the player screen and the lyrics sit below the fold,
reached by scroll or by sync's own auto-scroll. No change was needed there;
recorded so nobody goes looking for the mechanism.

### D-081 — The column is the player
**Built 2026-08-25.** The owner's read, and the right one: with the disc, the
title and the artist already stacked in the column, a boxed mini-player
repeating the name underneath was the record redundancy again, in words.

**In the hero the bar is chrome-less controls** — play, notices, Sync, video,
scrub — with no card around them and no title or artist of their own. The
column supplies the context; a surface drawn around one slice of it fenced the
controls off from the composition they belong to.

**Both come back with the dock.** Pinned to the foot of a scrolled page the
bar stands alone over moving lyrics: it regains its sheet, and it is the only
thing saying what is playing, so the title and artist return. One component,
two honest states — in the composition it borrows context, standing alone it
carries its own.

**Notices speak in both states.** "Loading", "Timings are from another cut",
"Manual scroll" are the bar's own facts, not the page's, and they are the one
line of text the chrome-less bar keeps.

### D-080 — One record, and a sync the reader commands
**Built 2026-08-25.** Four reports on the split-view player, and pulling the
first thread unravelled the rest.

**The artwork was on screen three times** — lockup cover, the bar's spinning
miniature, the video thumbnail. Now the cover IS the record: a disc with the
track-accent spindle that spins while the song plays and holds its angle when
paused, the attributes the miniature used to carry, moved to the artwork that
was already the page's centrepiece. The bar's record is gone, and with it the
`artwork` prop and the entire `StreamingPlaybackBar` wrapper, which existed
only to resolve art for the miniature.

**The seekbar was missing because the dock retired** (D-079): it rendered
behind `docked &&`, and the rail never docks. The scrub row — elapsed, track,
total — now renders whenever there is a player, docked or not; docked, it
collapses back to the full-bleed top edge.

**"Sync button missing" was a condition that could never be true.** The old
Resync pill required `manual && syncing`, and D-075's drift made `syncing`
permanently false — so on any drifted track the one control that could have
helped could not render. There is now a single Sync toggle, shown whenever
timings exist: pressed while the canvas follows, and able to overrule the
drift default in both directions. D-075 withheld sync with no recourse; the
reader has the last word now, with the notice standing down once they use it.

**And the lyrics "not being synced" was the drift threshold punishing honest
metadata.** Seven seconds was tuned on one true positive — a 63-second
official-video intro — and then fired on "Choo Lo": video 234s, LRCLIB claims
252s. Same cut, sloppy uploader-typed duration field. A false positive used to
be harmless caution; once it sets the sync *default* it turns sync off for
readers whose timings were fine. Retuned to 20 — every measured different-cut
delta clears it, ordinary metadata slop stays under it — with both real cases
pinned in the tests.

**Two strays fixed on the way.** "The Local Train · 23M views": LRCLIB's album
field carried a YouTube view count, now refused by `meaningfulAlbum` — and it
survived the fix through the 30-day track cache until the version bump, exactly
as that cache's own comment predicts. Headless verification could not start
YouTube playback (autoplay policy), so spin-on-play is verified by inspection:
it is the same one-line `data-spinning` wiring the record used.

### D-079 — The split view: a rail that stays, words that scroll
**Built 2026-08-25.** Two reports on the beside hero, one fix. The player pill
sat centred under a left-aligned lockup — two axes in one composition — and
the owner proposed the larger idea: on desktop, fix the art on the left and
let the lyrics scroll on the right.

That proposal quietly dissolves D-078's seam. The canvas is no longer *below*
a left-aligned hero with nothing to relate to; it is a column beside a rail,
and each owns its axis. The skill's database has no split-view entry — said
plainly rather than stretched — but its constraints all hold: the reading
measure stays bounded in its column, nothing scrolls horizontally, and the
sticky rail obscures nothing because it owns its own track.

**The player moved inside the lockup's text column**, which fixes the
imbalance at every width with one DOM change: centred on a phone because the
column is, left-aligned in the beside layout and the rail because the column
is. The axis is inherited instead of coordinated.

**From `lg` the shell is a grid: `rail | canvas`.** The hero spans all rows,
sticks at `top: 0`, and is pinned to exactly `100dvh`. The lockup stacks
again inside it — a rail is one narrow column, so "beside" has no room to
mean anything there. The grid lives beside the drawer coupling in
`insights.scss`, because both are claims about the same element: the drawer
squeezes the shell's padding, and the rail's `minmax` floor decides that the
canvas absorbs it. Measured with the drawer open: canvas 441→390px, rail
holding at 416.

**The dock retired itself on desktop, with no code knowing it.** The bar
docks when its slot's sentinel leaves the viewport; in a sticky rail the slot
never leaves, so the sentinel keeps reporting visible and the bar stays in
the composition. Probed while scrolled: `data-docked` never appears at `lg`.
Below `lg` everything behaves exactly as before — the dock, the beside
lockup at `md`, the centred stack on a phone.

**The fit-to-width title needed nothing again** — `cqw` resolves against the
rail column now, same arithmetic, third layout it has absorbed unchanged.

### D-078 — The cover beside the words
**Built 2026-08-24.** The hero mock's "beside" layout, chosen by the owner with
the seam marked and argued against — recorded as their call, made looking at
both: the wide screen trades a seam into the centred canvas for the reference's
composition. "Above" on a phone, per the same ruling, which keeps the narrow
layout — where most readers are — on one centred axis end to end.

**One lockup, two arrangements.** A grid that is a centred single column by
default and `cover | text` from `md`. The blurred ground drops to 0.45: the
sharp cover is now the artwork's appearance, and at full strength the ground
read as the same image shown twice.

**The fit-to-width title survived untouched**, and that is D-037 paying out:
the title is fitted against a `container-type` measure, so `cqw` resolves
against whatever column the measure occupies. The same arithmetic that fitted
a centred 64rem hero fits the narrower beside column with no new numbers.

**The no-artwork state is keyed on the cover existing, via `:has()`** — a
track with no resolvable art gets the old centred hero, not a layout with a
hole in it. The first cut got this half right and shipped a kicker hanging
left inside a centred lockup: the fallback recentred the lockup but not the
text block, whose own `align-items: flex-start` still applied. Caught by
screenshotting a track that happened to have no artwork — the probe that
confirmed the fallback had "applied" was true and beside the point.

### D-077 — Clearing the register
**Built 2026-08-24.** Four entries had sat unruled; three closed, one returned
to its owner.

**OD-026 — the social preview now opens at the hook.** The most-repeated line
in a song is almost always its chorus: the passage the artist chose to say more
than once and the line a stranger already knows. Counted on normalised text so
punctuation and case collapse; the window opens at the hook's first appearance
so the preview reads as a passage, not a supercut; falls back to the opening
when nothing repeats, because through-composed songs exist and for them the
opening is the statement. Pure, in `lib/lrc.ts`, tested.

**OD-020 — a component-test rig exists and has a first test.** happy-dom
behind a per-file `@vitest-environment` pragma — vitest 4 removed
`environmentMatchGlobs`, so the pragma is the mechanism that survives — and
the 250 pure-logic tests keep their sub-second runtime. The first test covers
`SectionHeading`, chosen because it is the markup the landing and the drawer
share: it asserts semantics (a real heading role, the lead excluded from the
accessible name, the action outside the heading), not styling. Also required
`afterEach(cleanup)` in the setup file: testing-library's auto-cleanup keys
off injected globals, which this config deliberately does not enable.

**OD-023 — rescoped honestly.** The dead `.canvas__glow` rule is gone, and the
site description no longer says "annotated" — the page was claiming a feature
that does not exist. Building it for real is the Genius referents API,
per-phrase ranges mapped onto LRC lines, and an interaction design for tapping
a phrase mid-read. That is a feature with its own decisions, not a cleanup.

**OD-024 — returned with options rather than decided.** Any analytics weakens
"nothing leaves the device", which the product says out loud. The register now
holds three costed options; the choice changes the privacy story and is the
owner's.

### D-076 — The light sheet and the open door
**Built 2026-08-24.** Options 3 and 4 from the player study, both advised
against there and both asked for anyway — so both built properly rather than
grudgingly, which for the sheet meant measuring the full on-light palette the
study said would be the cost.

**The docked bar rides a cream sheet** — the one light surface in the product.
Every pair on it is measured: ink reuses `--color-on-bright` (17.97:1),
`--color-sheet-muted` at L 0.45 gives 7.08:1, hairlines are translucent black.

**The accent could not ride along, and the numbers say why.** Every accent the
extractor can produce sits at L 0.72 — 2.16:1 against cream at worst,
invisible. `--track-accent-deep` re-derives the runtime channel at L 0.5 with
relative color syntax — `oklch(from var(--track-accent) 0.5 min(c, 0.17) h)` —
which clears 4.5:1 across every extractable hue (worst 5.20:1) without the
palette engine learning that light grounds exist. Verified in the browser: the
notice computes to the derived value, not the parent accent. Browsers without
relative color support inherit the on-bright ink instead, which degrades to
readable rather than to invisible.

**"Up next" became "Read next", and the renaming is the design.** In a player
it is a queue: the product decides and the next thing plays. This is a reader,
so it is an offer — two cards at the foot of the page, chosen by the same
scoring as the landing shelves, seeded per track so different songs open
different doors, excluding everything already read. Nothing advances on its
own, nothing is numbered. A queue is a promise to keep playing; this is a door
held open.

> It is also where the catalogue's hand-written `note` found its second home —
> arguing for a song the reader has not opened yet, which is the exact job
> D-045 wrote it for and the job D-069 removed from the landing cards.

### D-075 — The right song, the wrong cut
**Built 2026-08-24.** Reported with a concrete pair of links: our "Blinding
Lights" plays the official video, whose cinematic intro puts every synced line
tens of seconds from the voice; the upload the timings were actually cut for is
the audio release. D-071 solved *which recording the lyrics are* — this is its
sibling: the lyrics are right and the **video** is a different cut, because
artists ship two or three uploads of one song and Genius links the official
video by default.

**Both durations were already in hand.** LRCLIB records the duration its
timings were made for; the IFrame player reports what actually loaded. More
than seven seconds apart means a different cut — rips of the same cut differ by
a second or two, official videos by tens. `timingsDrift` in `lib/lrc.ts`, pure
and tested against the reported numbers (200s vs 263s).

**On drift, sync is withheld rather than run wrong.** The canvas falls back to
scroll-spy and the bar says "Timings are for a different cut". A canvas
scrolling to lines tens of seconds from the voice is worse than one that says
why it stopped following.

> **Deliberately not done: shifting the timestamps by the difference.** That
> assumes all the extra time is intro, and an official video splits it between
> intro and outro in proportions nobody publishes. A sync that is confidently
> wrong is worse than none.

**Detection stays quiet on missing data** — LRCLIB omits duration on some
uploads, and the player reports 0 until ready. Claiming drift there would
disable sync for exactly the tracks we know least about.

**The full fix is out of reach without a second API.** Choosing the *audio*
upload requires searching YouTube, and the Data API prices search at 100 quota
units against a 10,000/day default — the same economics that parked the last
three playback misses in D-070. If a YouTube key ever arrives (OD-005), the
right query is title + artist + "audio" filtered by duration ≈ LRCLIB's.

### D-074 — Depth of field, borrowed from a player and bounded by contrast
**Built 2026-08-24.** From a music-player reference: the current line lit, each
line below it dimmer than the last. The best idea in it, and the study
(published separately) settled how much of it we can actually have.

**The reference's signature look is unreadable text.** Measured against our
reading ground, its trailing lines sit at roughly 0.35 and 0.15 opacity —
**2.57:1 and 1.34:1**. That is entirely reasonable in a player, where you are
listening and the faded lines are atmosphere. It is not available to a product
whose claim is that the words deserve to be read: a reader scanning back two
lines to re-read something has to be able to.

So the idea ports and the values do not. The usable range runs from 1.0 down to
the floor D-053 established, and that is still three real steps:

| state | opacity | contrast | what it is |
|---|---|---|---|
| `active` | 1.00 | 18.56:1 | the stanza being read |
| `near` | 0.62 | 6.48:1 | one either side |
| `idle` | 0.42 | 3.29:1 | everything beyond — the floor |

**Symmetric, deliberately.** The reference fades only downward, because a
player has a direction of travel. A reader does not: going back up to re-read a
line is reading, and it must not be harder than reading on. `stanzaState`
answers on absolute distance.

**The ladder lives in `lib/motion.ts` and is tested**, not left in a
stylesheet. These are contrast decisions, and the test pins the floor, the
ordering, and that the steps stay far enough apart to read as depth rather than
as a rendering artefact. Mutation-tested: dropping `near` to 0.30 fails three
of them.

**All three states are also declared in CSS.** Motion drives the opacity once
hydrated, but a reader whose JavaScript has not arrived would otherwise get the
binary version of a graded design.

> **Checked rather than assumed:** the canvas comment warns that many LRC files
> carry no blank lines and collapse to a single stanza, which would leave
> nothing to grade. Sampled across twenty catalogue tracks: **none** collapsed,
> five had 2–4 stanzas and fifteen had five or more. The worry is real in
> general and does not bite this catalogue.

**Not taken from the reference, and why.** Art beside the lyrics suits the hero
and not the canvas, which is one long centred scroll — worth a mock before
committing. A light sheet under the dark stage would introduce a third ground,
and every ink, hairline and control in the product is measured against one of
the two we have. "Up next" and playlists are a product decision wearing a
visual costume: they would make this a player that shows lyrics rather than a
reader that plays audio.

### D-073 — The constraint is the catalogue, not the algorithm
**Built 2026-08-24.** D-072 got a reader who answers all three questions from
three distinct tracks to four, and that was the ceiling: there are only four
songs in the catalogue that are longing *and* confessional *and* deep cuts. No
ranking technique produces a fifth.

Measured properly, the shape of the problem is worse than that one cell:

```
56 tracks across 32 cells (4 moods × 4 pulls × 2 scored familiarities)
  empty      5
  thin (1–2) 17
  healthy    10
```

**Twenty-two of thirty-two cells hold fewer than three tracks.** Language and
era are balanced — english 27 / hindi 29, classic 25 / modern 31 — so the gaps
are entirely mood × pull.

`scripts/propose-catalogue.ts` reports that, proposes candidates for the
thinnest cells, resolves each to a real LRCLIB entry, and classifies it. It
**proposes and never applies**.

**It refuses to write the `note`.** The type already says the note is written
rather than generated (D-045) — it is the editorial half of "why this", and a
model asked to justify a pick invents a rationale it had no part in. Every
emitted entry carries an empty note above a TODO, so an unreviewed paste is
obvious on sight rather than shipping quietly.

**Resolution runs through the product's own search**, ranking and all. If
`searchLyrics` cannot find a clean synced entry, neither can a reader, and the
card would be a dead end — two of six candidates were rejected on exactly that.
It is also a standing test of D-071: the ranking is being used, not just
tested.

### What running it taught

**The cell a track fills is an outcome, not an instruction.** The suggester
guesses from a title and an artist; the classifier reads the words. They
disagree often and the classifier is right — "Fast Car" was proposed for
*tender · wordplay* and came back *longing · storytelling*, which is what the
song is. So filling a named gap takes more candidates than gaps, and the tool
now reports where each track actually landed and whether that cell was thin.

**LRCLIB casing is not editorial casing** — "EMINEM", "the Mountain Goats",
"channa mereya". Every existing catalogue entry is properly cased, so anything
shouting or whispering is flagged in the output and in the emitted comment.

> **Not done, deliberately:** no tracks were added. Which songs belong in the
> catalogue is the editorial decision this whole product is built on, and the
> tool exists to remove the typing, not the judgement.

### D-072 — The same three songs, forever
**Built 2026-08-24.** Reported as "the suggestions are the same if I select the
same parameters, or skip entirely". Both true, and for the same reason: the
seed came from the date alone, so a given set of answers produced one shelf
that stood all day for every reader who gave them. The catalogue holds
fifty-six tracks and was showing three.

**Three changes, and the interesting part is which one did the work.**

**A rotation that counts visits, not days.** Folded into the seed, stored so a
single visit stays stable — the shelf must not reshuffle under a reader who
merely answered a question or resized a window. Plus a "Show three more"
control, because a reader who wants another look should not have to leave and
come back.

**Memory of what has already been opened.** Read tracks sink beneath unread
ones by a penalty, not a filter: the catalogue is finite, and a reader who has
been through it should still get a shelf rather than an empty page.

**A shortlist, after two attempts that did not work.** Measured across ten
visits, the rotation alone moved a reader who *skipped* from 3 distinct tracks
to 23 — and a reader who *answered all three questions* from 3 to 4.

> The arithmetic says why, and it is worth writing down. `score` moves in steps
> of 1.5 to 3, which the ×1000 scale turns into gaps of 1500–3000, while the
> shuffled position spans 0–55. **Any multiplier small enough to preserve
> relevance is far too small to move anything, and any multiplier large enough
> to move something has already thrown relevance away.** Weighting one number
> against the other cannot express what was wanted.

So the two decisions were separated: relevance decides which tracks are
eligible, the rotation decides which of them appear.

**Cut at the score cliff, not at a fixed twelve.** The first shortlist took the
top twelve by score and broke a promise the product makes — answer "defiant"
and every pick is defiant. There are fewer than twelve defiant tracks, so a
fixed window reached past them into songs the reader had just said they did not
want. The existing test caught it. Cutting at the cliff — every track that
matches as well as the best one, and none that matches less well — keeps the
guarantee exactly.

| answers given | distinct tracks over ten visits | mood relevance |
|---|---|---|
| skipped | 23 / 30 | — |
| mood only | 13 / 30 | 30 / 30 |
| mood + pull | 8 / 30 | 30 / 30 |
| all three | 4 / 30 | 30 / 30 |

Every one of those was **3** before.

**The last row is a real limit, stated rather than hidden.** In a catalogue of
fifty-six there are only four songs that are longing *and* confessional *and*
deep cuts. Widening the shelf for that reader would mean showing them something
they explicitly did not ask for. Their exploration lives in "People also like",
which is loose by design, and in `familiarity: "surprise"` — an answer that
deliberately scores nothing.

> **Traded away:** every visitor no longer sees the same picks on a given day.
> That was D-045's design — a shared daily rotation, and no cron job needed to
> move it. Visits are counted per reader in `localStorage`, so the shelf is now
> personal. Worth it for the stated goal, and reversible by dropping the
> rotation from the seed.

### D-071 — Which recording, and the reader's way out of the wrong one
**Built 2026-08-24.** Closes the ranking half of OD-028 and adds the escape
hatch. Reported as "most of the time it returns the LoFi / home demo / video
version, and then the lyrics do not sync".

**Why this is worse than a bad search result.** An LRC file's timings belong to
the recording it was made from. A LoFi cover's timings are *correct* for the
LoFi cover. Land on the wrong entry and the page renders, the lyrics scroll,
the player plays — and they are simply the wrong recording's words at the wrong
tempo. Nothing reports an error, which is why this survived every check the
product had.

> The proposal on the table was to always resolve the *audio* to the canonical
> version. That would have made it worse: forcing the studio recording behind a
> LoFi lyric file breaks a sync that currently works. The choice has to be made
> when the LYRIC entry is picked, and the player then follows for free.

**Ranking, in `src/lib/ranking.ts` as pure tested logic.** Three signals:

- **Canonical artist from Genius**, which keeps an editorial catalogue where
  LRCLIB keeps uploads. The only signal that separates a faithful cover from
  the original.
- **Variant tags in qualifier position** — bracketed, after a top-level dash,
  or as a trailing tag on a long title. Kept deliberately distinct from D-070's
  *packaging* vocabulary: "Official Video" is the same recording labelled,
  "LoFi" is a different performance.
- **Duration outliers** at a factor of two, weighted heavily enough that a
  correct artist tag cannot rescue a "Creep" running 949 seconds.

Covers are ranked lower and never removed; someone may have come for the Sanam
recording.

Measured, cold and warm: "wonderful tonight" moved Eric Clapton from third to
first, "holocene" moved Bon Iver above an unrelated song of the same name, and
"lag ja gale" moved Lata Mangeshkar above five Sanam covers.

### Four bugs, all found by measuring rather than reading

1. **A median needs a middle.** With two candidates the "median" was one of the
   pair, so the rule fired against the *genuine* track and promoted the junk.
   Requires three samples now.
2. **Substring artist matching** let an upload tagged "radiohead creep" claim
   to be Radiohead and take the boost. Whole-word now, with a length bound.
3. **The ranking was reordering a list the answer was not in.** `searchTracks`
   ranks *then* slices, so asking it for twice the display limit cut the pool
   using the ranking that has no hint. "lag ja gale" returns sixteen entries
   with the only Lata upload at number ten — the boost worked perfectly, on six
   entries she was not among. A pool of 40 is cached and ranked here instead.
4. **A two-word title is entirely tail.** The trailing-tag window read "Cover
   Me" as a cover of something. It now applies only from four words up.

**Results are cached; the order is not.** The hint takes 760–950ms and is
allowed to miss its 900ms deadline, so a first search can legitimately rank
without it — and storing that order would serve one unlucky call to everyone
for the life of the entry. Ranking on read lets the separately-cached hint
correct it from the second search onward.

**Six of sixty curated picks pointed at the wrong recording** — a LoFi edit, a
home demo, a live cut, two trap mixes. Five now point at the original.
`scripts/audit-catalogue.ts` finds them; a script rather than a test, because
the answer lives on LRCLIB and a unit test that reaches the network fails when
someone else's server is slow.

**The sixth has no fix, and that is the point of the last piece.** LRCLIB holds
exactly one upload of "Musafir Hoon Yaaron", and it is the LoFi. No ranking
finds a record that does not exist. So the reader gets told — `VariantNotice`
under the hero when the entry is a variant — and `TrackVersions` at the foot
offers the other recordings. That is the honest answer to a user-contributed
catalogue: rank well, then admit the limit and hand over the choice.

### D-070 — "No recording found" was mostly our search failing, not YouTube
**Built 2026-08-24.** Reported as "most of the time it says no recording".
Measured before changing anything, by running thirty catalogue tracks through
the real chain **the way the app opens them** — with LRCLIB's metadata, not
the curated catalogue's, which is the distinction that made the bug visible.

| | before | after |
|---|---|---|
| playable | 17 | **27** |
| no Genius match | 10 | **0** |
| matched, but Genius has no media | 3 | 3 |

Ten of the thirteen failures never reached YouTube at all: the Genius search
found nothing.

**The query was sent raw while only the scoring was cleaned.** `canonical()`
strips release qualifiers — and it was used exclusively to score results. The
search itself was handed the untouched LRCLIB strings, so Genius was asked for
`"Phoebe Bridgers Motion Sickness (Official Video)"`, `"Eric Clapton Wonderful
Tonight [Official Live]"`, `"Lata Mangeshkar Lag Ja Gale (LoFi)"`. The cleaning
existed; it was applied to the wrong half of the problem. Scoring still runs
against the original strings, so a cleaned query cannot make a wrong match look
right.

**A full billing was compared as one string.** LRCLIB records `"Alka Yagnik &
Arijit Singh & A.R. Rahman & Irshad Kamil"`; Genius records a single
`primary_artist`. Compared whole those score near zero, so the match was
refused for songs both catalogues plainly hold. `creditedArtists` splits the
credit and scoring takes the best part. This lands hardest on film soundtracks,
where a playback singer, a composer and a lyricist are billed on one track —
which is to say, on exactly the catalogue this product cares most about.

> And a bug inside the fix, caught by the probe rather than by reading: the
> first version took `.at(-1)` of the credit list as "the artist to search
> for". On a soundtrack the billing runs singer → composer → lyricist, so it
> searched Genius for **Irshad Kamil**, who wrote the words and sang none of
> them.

**Two shapes of title noise arrive without brackets**, so `canonical` never saw
them: a qualifier after a dash (`"Holocene - Official Video"`,
`"Chura Liya Hai Tumne - Trap Mix"`) and a bare performer credit
(`"Kabhi Kabhi Mere Dil Mein Solo By Mukesh"`). `stripTitleNoise` removes a
tail only when every word in it is either a packaging word or one of the
credited names — because the naive version, trimming whatever follows a dash,
turns `"Frank Ocean - Nights"` into a search for **Frank Ocean**. That guard is
mutation-tested: forcing it to accept everything fails exactly the two tests
written to defend it.

**The remaining three are a data gap, and the copy now says so.** Genius holds
the song and has no YouTube entry for it. "No recording found" claimed
something untrue — we never look for recordings, we read the one Genius has
already linked — and for a song with a hundred million plays it is simply
wrong, contradicted in the same breath by the "Find it on YouTube" button
beside it. It reads "No player for this one".

> **Still open:** the three remaining misses could be resolved with a YouTube
> Data API search, but that costs 100 quota units per call against a default
> allowance of 10,000 a day — roughly 100 tracks. The current source is free
> and covers 90%. Not worth a second API key without a ruling (OD-005).

### D-069 — A card is three things, and a section says where it starts
**Built 2026-08-24.** Two requests, one root cause: the product had no
hierarchy to scan by.

**The Deep Dive cards are artwork, a title and an artist, and nothing else.**
The tags and the editorial note come off. Those three facts are what a reader
needs to decide whether to open a card; everything about *why* belongs on the
page they open, which is where they went to find out.

> Worth recording honestly: the note existed **only** on the card. The track
> route never reads the curated catalogue — its story comes from the insights
> drawer, which is different text entirely — so removing it retires that
> writing rather than relocating it. The `note` field stays in the catalogue
> rather than being deleted, because it is hand-written editorial and cheap to
> surface later.

The shelf-level line survives, because it is one sentence about the shelf
rather than a label repeated on every card, and without it "Today's Deep
Dives" is an unexplained assertion that three songs were chosen for you.

**Sections had no beginning.** Every section label in the product was set
identically — `text-micro`, uppercase, `--color-ink-faint` — the same size,
weight and colour as the helper text beneath it. Five of those on the landing
produced five interchangeable grey lines, and the spacing between sections was
uniform, so each label floated equidistant between the section above and the
one it belonged to. The one guideline in the skill's database that bites here
is *Font Size Scale — "consistent type hierarchy aids scanning"*: there was no
hierarchy, so there was nothing to scan.

> The skill's `landing` domain returned conversion-page patterns — hero,
> testimonials, CTA — which do not apply to a discovery page for a reading
> product. Recorded rather than stretched to fit: the three devices below are
> ordinary editorial practice, not a database match.

One `SectionHeading`, used on the landing and inside the story drawer:

1. **A hairline above the label.** The oldest way of saying "a new thing starts
   here", and the cheapest — no colour, no box, one pixel.
2. **The label steps up** to full ink at weight 600. A heading set in the same
   colour and weight as its own helper text is not a heading.
3. **Asymmetric space** — a lot above the rule, a little between label and
   content. Proximity then groups the label downward with what it introduces.

**D-048 is half-reversed, deliberately.** It argued that a label which
announces itself is a better boundary than a rule, and that a rule would add
chrome to a reading panel. The first half was right and the second was
over-cautious: four prose blocks with a coloured label on each still read as
one column, which is the complaint that produced this entry. The accent comes
off those labels in the process, which is a gain — it is now spent only on the
quote rule and the resonance card, the two places the panel quotes the song.

### A CSS mistake worth keeping

The first version wrote the rule's exception as `.section-heading:first-child`,
meaning "the first section in a column". Every heading in the product is the
first child of its own `<section>`, so it matched all of them and removed every
rule — and the change shipped to the preview looking **identical** to the thing
it was replacing. Caught by looking at the render rather than by trusting that
the CSS said what it meant. It is keyed on the section's position now:
`:where(.shelves, .insights) > :where(section, div):first-of-type`.

### D-068 — The Deep Dives row said the same thing three times
**Built 2026-08-24.** Raised on looking at it: the shelf read badly. Four
faults, three of them structural and one of them about information rather than
layout.

**A tag on all three cards describes the shelf, not a song.** Every card
carried its full list of matched reasons, and the picker is good at its job —
so all three routinely came back stamped "something tender", which is the
reader's own answer read back to them three times. A label that appears on
every card carries no information about any of them. The shared reasons are
now stated once, above the row, where they are true of the thing they are
attached to; each card keeps only what tells it apart from the other two, and
often that is nothing, which is the honest answer — the editorial note is then
the whole of the difference and gets the card to itself.

> The code already knew. The comment being replaced reads "the three picks
> share identical reasons 42% of the time", and concluded that repeated tags
> "read as classification". They do not; they read as a stutter. The
> measurement was right and the conclusion drawn from it was wrong.

**A song title was clamped to keep three cards uniform.** `line-clamp(1)` on
`.dives__title` turned "Wonderful Tonight" into "Wonderful…". The
ui-ux-pro-max guideline names this exactly — *Essential Text Truncation*,
severity Critical: "headings and distinguishing names need complete access; do
not clamp essential meaning only to make cards uniform." Now two lines, with
the second reserved from `sm` so the artist, the rule and the note align
without any title being shortened to get them there. A longer title still
clamps, and the card links to a page whose hero **is** the full title — a
visible path to the whole name rather than a hover tooltip, which the same
guideline forbids.

**The grid stretched the wrong element.** `.dives` is a grid and stretches its
children, but the child is motion's animation wrapper; the `<a>` inside it kept
its content height. Three cards with different amounts of text therefore ended
at three different depths. The wrapper now passes the stretch through.

**Anchoring the note to the card floor was the obvious move and the wrong
one.** `margin-top: auto` on `.dives__why` aligns the notes' *bottoms* — so
with equal-height cards a three-line note begins higher than a two-line one and
the rules sit at three different heights. Everything above it is fixed —
square art, two reserved title lines, one artist line — so leaving it in flow
puts the rule at the same y on all three, which is the alignment a reader
scans by. Measured after the change: card bottoms, artist tops, rule tops and
note tops all identical at 768px and 1280px.

**Also from the skill:** *Compact Label Overflow*, severity High — "do not let
one compact label wrap to a second line". The tag row wrapped to two rows on
some cards and one on others, which is what pulled everything below out of
alignment. Fewer tags fixes the cause; `white-space: nowrap` holds each label
whole.

### D-067 — Auditing the surfaces the redesign touched
**Built 2026-08-24.** D-065 restyled every interactive control in the product
and verified them by eye. This is the pass that measured them, and it found
three real defects — plus two false alarms that were properties of the harness
rather than of the page.

**The devtools shipped to production.** `<TanStackDevtools>` was mounted
unconditionally in `__root.tsx` — a scaffolder default nobody gated — so the
production build put a floating trigger in the bottom-right corner of every
page, which is exactly where the Discover button lives. A reader got a control
that is not part of the product sitting on top of the one that is, plus the
devtools bundle on every page load. Now behind `import.meta.env.DEV`, which is
statically replaced at build time, so the subtree **and its imports** drop out
of the bundle rather than merely rendering nothing. Verified by grepping the
built assets: no `tsd-trigger`, no devtools reference, and the only button in
that corner is `.discover`.

**Fourteen of twenty-five touch targets failed at 390px.** The browse rows —
`.also__row` and `.recent__link`, which are the main way into a track on a
phone — measured 40px against the 44px this product holds itself to (D-035).
Two text-only controls were worse: "Clear" at 20px and "Search another" at
18px, the latter being how a reader leaves a track. Fixed with a declared
`min-height: 2.75rem` on the rows and a `.tap` utility for the two controls
styled entirely with utilities in the JSX.

> Padding arithmetic got the rows to **43.99px**, which rounds to 44 and passes
> a sloppy check. `min-height` states the contract instead of deriving it from
> a line-height that changes with the loaded face.

**A filled chip's quiet label measured 4.46:1.** `.taste__chip-label` inside an
open chip is `color: inherit; opacity: 0.7` over the accent fill. Against the
worst accent the extractor can produce that composites to 4.46:1 — under the
bar by four hundredths. It is never actually reached today, because the chips
only appear on the landing where the accent is always lime (7.48:1) — but a
value that is only safe while a component stays where it was born is not safe.
0.78 clears every accent at 5.2:1.

### Two false alarms, and why they are worth recording

Both would have been reported as serious regressions by an audit that trusted
its own output.

**"No element on the page has a focus ring."** `el.focus()` from script does not
match `:focus-visible` — the browser only applies it when it judges the focus
came from the keyboard. Driving real Tab keypresses through BiDi's
`input.performActions` produced the same answer, which looked like confirmation
and was not: `:focus` was not matching *either*, because a headless window is
not "active" and focus styles do not apply in an inactive document.
`browsingContext.activate` does not fix it. The question was settled instead by
reading the compiled stylesheet — the `:focus-visible` rules are present, and
the only two `outline: none` rules in the entire build are the two intended
ones (`.search__input:focus`, whose 2px border is the indicator at 10.39:1, and
`[tabindex="-1"]:focus` from D-062).

**"The track page renders completely unstyled on mobile."** A stale browser
cache serving an older route chunk. Caught by checking which stylesheet hash the
document had actually loaded before reporting anything.

> The lesson both times: when a check reports that something basic is broken
> everywhere, suspect the check. A real regression is rarely uniform.

**Still open, and a design decision rather than a defect:** the Discover button
is `position: fixed` in the bottom-right and permanently covers part of the
reading column on a phone. Standard floating-action behaviour, but this is a
product whose claim is that the words deserve to be read, which makes it worth
a ruling rather than a default.

### D-066 — Two typefaces tried against the new design, both declined
**Trialled and reverted 2026-08-24.** Fraunces and Outfit stay. Recorded
because the trial produced a measurement worth keeping, and because the same
question will come back.

**Rufina and Domine were both ruled out by the same missing capability.**
Neither ships an italic, and `font-synthesis: none` is set product-wide — so
the landing headline's emphasised word does not render upright, it falls
through the display stack until it reaches a family that *does* have an italic,
which is a system serif. Not ugly, but nothing chose it. A move to either face
means redesigning that headline rather than swapping a font.

**Cormorant Garamond has a real italic and was still declined**, on a number
rather than on taste. Measured from the font binaries:

| Face | Role | x-height | Cap height | Mean advance |
|---|---|---|---|---|
| Fraunces | display | 0.482 | 0.700 | 0.515 |
| Outfit | UI | 0.475 | 0.694 | 0.504 |
| Cormorant Garamond | display | 0.386 | 0.625 | 0.417 |
| Elms Sans | UI | 0.480 | 0.700 | 0.530 |

Fraunces sits **1.5%** off Outfit's x-height — near enough to identical that the
two share a line at one font-size and read as a single piece of type, which is
exactly what the landing headline asks of them. Cormorant sits **19.6% below**
Elms Sans: at the same font-size it reads a fifth smaller, which is why the
Deep Dive card titles undersized against the artist names beneath them. It
would need 125% of the font-size wherever it meets UI text, or
`font-size-adjust: ex-height 0.48`. That is a retuned type scale, not a swap.

> **x-height, not font-size, is what makes type look big.** Worth pinning to
> this register: any future display face has to be checked against the UI
> face's x-height *before* it is judged by eye, because a face that under-sets
> looks "elegant" in isolation and broken beside a label.

**Cormorant also needed weight compensation** — its 400 is drawn for display,
and a verse of it on the reading ground at idle opacity thinned to the point of
shimmering. The trial ran lyrics at 500 and the hero at 600 to be fair to it.

**Seven font packages removed** in the same pass — 6MB of `node_modules` that
nothing imported: Elms Sans (both builds), Rufina, and four Devanagari
candidates left over from the bake-off Vesper Libre won (Martel, Rozha One,
Tiro Devanagari Hindi, Noto Serif Devanagari). Verified by resolving every
package name against `src/`, `scripts/` and `vite.config.ts` before removal,
then by rendering a Latin + Devanagari + Tamil Lyric Card, which reads the font
binaries at runtime and would have 500'd on a missing one.

### D-065 — The direction, carried into every surface
**Built 2026-08-24.** D-064 established a palette, two typefaces and a landing
page. It did not restyle the twelve other surfaces the product is made of, so
the landing spoke the new language and the search popover, the dock, the drawer,
the composer and every card still spoke the old one. This is that second half —
and finishing it surfaced three defects in the first.

**Glassmorphism is gone, and its removal is the point rather than a tidy-up.**
Six declarations produced a translucent panel whose contrast depended on
whatever happened to be behind it. Behind the masthead and the playback bar that
is full-bleed album art, which is a different colour on every track — so nothing
sitting on those surfaces had a contrast ratio that could be *stated*, only one
that happened to hold for the cover being looked at. Every surface now declares
its own colour and every ink on it has a number. `@mixin glass` is replaced by
`surface` / `floating` / `bright`.

**Elevation runs downward on the bright ground, and that is a correction.**
D-064 stepped `--color-surface` and `--color-surface-raised` *up* from the
canvas, the way a dark theme does. On a ground at L 0.478 that walks straight
into the ceiling: cream on the raised surface measured **4.17:1** and the muted
ink **3.00:1** — both failing, on the surfaces that carry every card, chip and
popover in the product. Elevation is contrast against the ground, not a fixed
direction; on a bright ground the only direction with room left is down.
Re-measured: cream 9.20:1 on surface and 11.86:1 on raised, muted ink 6.62 and
8.53, lime 8.06 and 10.39. The reading ground still steps up, because there the
room is in the other direction.

> Because the two grounds now elevate in *opposite* directions, "the next
> surface along" means the opposite thing on each — so a hover written as
> `--color-surface-raised` lightens a row on one page and darkens it on the
> other. Hover is therefore a translucent white veil (`--color-hover`), which
> always reads as the row lifting toward the reader, including under an
> extracted per-track palette.

**Nothing in the product was ever filled.** Every button was an outlined ghost,
so no screen had an obvious thing to press — the Discover button, the feature
the product is named after, was a glass pill floating over the lyrics that a
reader had to already know was there. There is now one bright control per view:
Discover on a track page, Download on the composer, the way onward on a dead
end. The fill is `--track-accent`, whose lightness is pinned at 0.72 by the
palette extractor, so `--color-on-bright` clears 4.5:1 on top of it for **every
hue and chroma the extractor can produce** — worst measured case 6.96:1, swept
across all 360 hues.

**Two numbers had gone quietly stale, three files apart.**

- `--stanza-opacity-idle` was 0.38 because D-053 measured it at 3.28:1 against
  an `oklch(0.13)` reading ground. D-064 lifted that ground to `0.155`, which
  raised the floor of the composite and dropped the same 0.38 to **2.86:1** —
  back under the 3:1 large-text bar, from a change made in a different file.
  Now 0.42, at 3.24:1, mirrored in `src/lib/motion.ts`.
- `palette.server.ts` pins canvas/surface/raised lightness to the reading ground
  and carries a comment saying they are copied verbatim from `styles.css`.
  D-064 moved the stylesheet and left the extractor behind, so a track **with**
  artwork rendered three steps darker than the same track **without** it — the
  palette engine quietly undoing a palette change. Contrast floors still held,
  which is why nothing failed; it simply meant two different products depending
  on whether a cover happened to resolve. The test beside it now pins all three.

**Grain follows the paper metaphor rather than the whole app.** Texture exists
to make a surface read as a printed page, which is the claim the lyric canvas
makes and the claim the landing does not. Over saturated electric blue an
overlay-blended noise does not read as paper; it reads as the colour being
slightly dirty. Grain is now zero by default and restored on the reading ground.

**The Tailwind tree-shaking trap caught the same change twice.** D-064 recorded
it for the brand accents. It then took `--color-hover`, `--color-hover-strong`,
`--color-well` and `--radius-nested` — declared the ordinary way, they went out
in a build where every hover state and every nested corner silently did nothing.
The rule is now stated plainly in `styles.css`: **a token used only from SCSS
belongs in the `@theme static` block.** Verified by grepping the compiled
stylesheet, which is the only check that actually proves it.

**Fraunces' axes are set per role, not globally.** The hero pins `opsz` 144 with
`SOFT` 40 — explicitly, because `font-optical-sizing: auto` tracks the *computed*
size and the hero's size is a `min()` of three terms, so a long title that shrank
to fit would also get a different, text-weight drawing of the letterforms. The
lyric canvas pins `opsz` 32 with SOFT and WONK at zero: those are someone else's
words, read at length, and the face's job there is to disappear. The character
belongs on the landing and in the hero, where the product speaks in its own
voice.

> **Considered and rejected:** reinforcing the sung line with weight as well as
> colour, the obvious second channel for WCAG 1.4.1. Fraunces is variable, so a
> weight change alters every advance in the line and re-wraps it — under a reader
> following along, mid-song. The stanza's own opacity step is already a
> non-colour channel, and it does not move the text.

**Verification.** Driven through WebDriver BiDi rather than
`firefox --screenshot`, which captures at the load event — before hydration, with
every motion component still at its `initial` variant, i.e. genuinely invisible.
Landing, stepper, discovery shelves, track hero, lyric canvas, docked bar and the
insights drawer were each rendered and read at 1280px and 390px. One apparent
regression — a completely unstyled track page on mobile — was a stale browser
cache, confirmed by checking which stylesheet hash the document had actually
loaded before reporting anything.

### D-064 — A new visual direction: electric, playful, and still readable
**Built 2026-08-24.** A deliberate reversal of D-005, D-019 and D-052, asked for
explicitly: a brighter, friendlier product aimed at a younger audience, with
reference images supplied.

**Three decisions were put to the reader before any code changed**, because
this replaces a design system rather than extending one. The references were
two *different* styles — one bright playful-maximalist, one dark cinematic
gradient — and the choice between them changes everything downstream.

**Direction: bright pop.** Electric blue ground, cream ink, lime primary and sun
secondary. Every pair measured rather than picked: cream on blue 6.75:1, lime on
blue 5.91:1, sun on blue 4.93:1, ink on lime 15.72:1. The muted tone is 80%
cream at 4.86:1 — 76% is where it stops clearing 4.5, so it carries headroom
instead of sitting on the line.

**The reading canvas stays calm**, and that is a product decision, not a
compromise. Long-form text on a saturated ground is tiring, and this product's
entire claim is that lyrics deserve to be read properly. So `--color-canvas` is
the brand and `--color-reading` is where a lyric is set, scoped by
`body:has(.track-shell)` — on `body`, because the page background paints from
body's own computed value and a token set on a descendant never reaches it,
which is the trap D-052 documented. The palette engine still repaints per track,
which is exactly where that work belongs.

**Type: Fraunces + Outfit.** Fraunces is loaded with all four axes — opsz, SOFT
and WONK — because those are the point: the headline's "properly" is set in its
real italic with the wonk pushed up, and that single word carries most of the
personality. Outfit is a geometric sans at 32KB. Neither is Inter, Poppins nor
Space Grotesk, which is where this brief usually lands.

> The infrastructure built over the last two days paid for itself here.
> Swapping the display face meant regenerating card metrics and the
> metric-matched fallbacks — both are generators now, so it was two commands
> rather than two days. The twelve script companion faces were untouched:
> they are functional coverage, not style, and a redesign has no business
> removing Tamil support.

**A Tailwind v4 trap, worth recording.** `@theme` tree-shakes tokens it cannot
see used, and the brand accents are referenced only from `.scss`, which Tailwind
does not scan. Declared the ordinary way they were silently dropped from the
build and `color: var(--color-lime)` resolved to nothing — the headline rendered
cream and looked like a styling mistake rather than a missing token. They are
now in an `@theme static` block, which emits regardless of use.

**Skipping the stepper was three dismissals, not an escape.** "Skip" answered
one step at a time, so a reader who did not want to answer at all still had to
work through the whole flow to reach a search field. That is the same wizard
with different buttons. There is now a single control that ends it outright —
styled as a real alternative rather than as fine print, because for a reader who
arrived with a song in mind it is the only thing on that screen they want.

**The intro is server-rendered and cleared by CSS**, not by React. If it waited
for hydration it would flash in *after* the page, which is the opposite of an
intro; and if a JS-driven overlay outlived a failed bundle it would lock the
reader out entirely. The animation that removes it is pure CSS with `forwards`
fill, so the page frees itself whatever happens. React's only job is the one
thing CSS cannot know — whether this reader has already seen it this session.
Under reduced motion it does not play at all: there is no gentler version of a
splash screen worth showing to someone who asked for less movement.

### D-063 — The landing showed the choice without ever making it
**Built 2026-08-24.** Closes the entry-flow request from D-059, which had
drifted.

The ask was to tell a reader they can either pick a mood or just search. D-059
built the structure for that — a labelled field, a ruled "or", labelled chips —
and then D-060 removed the heading that framed the search half ("Know the
song?") because the field gained its own visible label and two heading-shaped
things above one input compete.

That fix was right and the framing was collateral. What survived reads as a
choice **only to a reader already looking for one**; someone with no song in
mind sees a search box and reasonably concludes that is the product. Structure
implies; it does not tell.

One line above the field now names both routes. Not a heading — the field owns
the only heading-shaped element here — and set at a 46ch measure so it reads as
the section's opening sentence rather than as helper text belonging to the
input.

> Writing it surfaced a duplicate: the new lead offered to "tell us how you want
> to feel", and the mood description below said "Tell us how you want to feel
> and we will pick" — the same sentence twice on one screen. The description is
> now only the part the lead does not cover.

**Verified by rendering it**, which needed a harness. The landing's discovery
state is unreachable in a headless capture: it renders only after hydration
reads `localStorage`, and a fresh profile has no preferences, so the page shows
the stepper instead. A temporary same-origin page reproducing the section's
markup against the built stylesheets gave a real render of the CSS.

> Two false readings came out of that harness before it was trustworthy, both
> worth remembering. Component SCSS is code-split into a route chunk, so linking
> only `styles.css` renders the section unstyled and invites "fixes" to CSS that
> was never loaded. And the harness pinned hashed stylesheet filenames, which
> change on every build — so an edit appeared to have no effect while the page
> was quietly loading a 404. The apparent cramping that prompted a spacing change
> was that 404, not the spacing.

### D-062 — The rest of the audit: 122 stack rules and 119 guidelines
**Built 2026-08-24.** Completes the `ui-ux-pro-max` pass. D-061 acted on about
ten guidelines found by ad-hoc query; this is the systematic read — every rule
in `react`, `html-tailwind` and the full guideline set, checked against the
code rather than sampled.

**Focus never moved on a route change.** In a multi-page site the browser does
this for free: a new document resets focus and the page is announced. A
client-side router does neither. The link the reader activated unmounts, focus
falls back to `<body>`, and nothing is said — so a screen reader user who opens
a track hears silence, and a keyboard user's next Tab starts from the top of the
document rather than from where they arrived.

`RouteFocus` moves focus into `#main` on each change. That landmark already
exists on every route as the skip link's target (D-053), so this reuses it
rather than inventing one.

> Three details that are the whole difference between fixing this and breaking
> something else. It skips the first render, where the browser already has focus
> right and stealing it would fight the skip link. It uses `preventScroll`,
> because the router restores scroll position and focusing the top of the region
> would otherwise yank a returning reader back up the page. And it compares the
> previous path to the current one, so a re-render reporting the same route does
> not throw the reader to the top — which also makes `pathname` a value the
> effect reads rather than a dependency it merely lists, the thing Biome
> correctly objected to.

**Disabled was doing the work of busy.** `aria-busy` appeared zero times. The
drawer's trigger and the card composer's download both disable during a
multi-second server operation, and the visible label changes — but a screen
reader reaching a dead button was told only that it was unavailable, which reads
as broken rather than working.

**Two SVGs had no intrinsic size**, so they laid out at the SVG default of
300×150 until the stylesheet resolved them. On the masthead — a fixed element —
that briefly covers the corner of the page.

**Checked and already correct.** Recorded so the next pass does not repeat the
work: React 19.2.8 clears the RSC security floor; no `forwardRef` in new code;
the three array-index keys are all fixed, non-reordering lists; no context
providers to memoise; images reserve space through a fixed box or
`aspect-ratio`; `min-w-0` is used where flex children hold unpredictable text;
no class tokens built by interpolation; `scrollRestoration` is on; exits already
run shorter than entrances; the clock uses tabular figures; body type is 18px so
iOS will not auto-zoom the search field; `dvh` rather than `vh`; heading order
is h1→h2 with no skips; and the z-index scale is tokenised.

**Rejected, with reasons.** `touch-action: manipulation` — the 300ms tap delay
it addresses is already gone on any browser honouring `width=device-width`.
Preloading Rufina — tempting, but D-061's metric-matched fallback already makes
the swap quiet, and a preload would compete with the artwork preload that the
hero actually waits on. `staggerChildren` at 60ms against a suggested 30–50ms:
the pacing is deliberate and documented, not an oversight.

### D-061 — The typeface arrived and the page jumped
**Built 2026-08-23.** From a full `ui-ux-pro-max` pass over the app.

**The generated design system was rejected, deliberately.** Asked for a
product-wide direction it returned Swiss/Minimalism — its own notes say "best
for enterprise apps, dashboards" — on a light red palette (`#FEF2F2` ground,
`#DC2626` primary) set in Inter and Playfair Display. That is close to an
inventory of what this product already decided against: D-052 moved off
vermilion precisely because it is where generative design lands by default, and
Inter/Playfair is the stock editorial pairing. Recorded here because "the tool
said so" is not a reason, and the tool's own instructions say results are
recommendations, never overrides. The searchable guidance is what earned its
place; the generated identity did not.

**Font loading shifted the layout, and the display face is the product.**
`font-display: swap` was already set, which guarantees the swap happens — it
does nothing to make it quiet. Measured, per character and weighted by English
letter frequency:

| Webfont | Standing in for | Wider by |
|---|---|---|
| Rufina | Georgia | 5.7% |
| Rufina | Times New Roman | 16.3% |
| Elms Sans | Arial | 11.7% |

Ascent differs as much as width — Rufina 0.945em against Georgia's 0.756em — so
line *boxes* changed height as well as line lengths. Every cold load re-wrapped
and re-flowed the moment the fonts arrived, most visibly on a hero set at 11rem.

Three `local()` fallbacks now carry `size-adjust` and the `*-override`
descriptors, scaled to each webfont's own metrics. They cost nothing to fetch —
the reader already has the font — and where neither local face exists (most
Linux, most Android) the rule simply fails to match and the stack continues to
the generics, exactly as before.

> Two guards, because Georgia covers Greek and Cyrillic: the fallbacks are
> declared Latin-only by `unicode-range`, **and** placed after the script
> companions in the stack. Without both, a local Georgia would claim Greek and
> Cyrillic before Noto Serif could (D-057).

Generated by `scripts/generate-font-fallbacks.ts` rather than typed, so a change
of display face cannot leave stale numbers behind. It prints the block rather
than rewriting `styles.css`, because that file is maintained prose as much as
code and a generator would flatten the comments.

**Every button said it was not clickable.** There was no `cursor` declaration
anywhere in the codebase. `<a href>` gets a pointer from the UA stylesheet;
`<button>` computes to `cursor: default` and never has. So the taste chips, the
stepper cards, the transport controls and the composer all showed an arrow while
behaving as controls. One `:where()` rule, excluding `:disabled` — there the
arrow is the truth.

**Checked and already correct**, listed so the next pass does not re-litigate
them: contrast is computed rather than judged (D-053); focus rings are present
and never removed; reduced motion is handled globally; touch targets clear 44×44
through `tap-target`; icons are SVG, never emoji; loading states use stable
skeletons with a live region (D-055); and there is no horizontal scroll at 375px,
verified by rendering it.

### D-060 — Two accessibility faults the new chrome made worse
**Built 2026-08-23.** From a `ui-ux-pro-max` audit of the D-059 work.

**Keyboard focus could be scrolled under the fixed chrome.** WCAG 2.2 AA
*Focus Not Obscured (Minimum)*. This product now fixes chrome to **both** edges
— the masthead on top, the player dock and the Discover button on the bottom —
and a track page is one very long scroll. Tabbing through it scrolls the focused
element to the exact viewport edge a bar is covering, and the reader loses the
thing they are on. There was no `scroll-padding` anywhere in the stylesheet.

`html` now sets `scroll-padding-top` and `scroll-padding-bottom` from the same
tokens the bars are positioned with, so anything the browser scrolls to — focus
included — stops short of both.

> `--masthead-reach` exists so the number is stated once. Two things need it:
> the landing's top padding, so the headline is not sat on, and the
> scroll-padding. Typed separately they drift, and the drift is invisible until
> someone tabs into the top of a page.

**The search field had no visible label** — a placeholder plus an `aria-label`,
which is the flagged anti-pattern rather than a substitute. The placeholder
vanishes the moment the reader starts typing, which is exactly when a reminder
of what the field does becomes useful.

It now carries a real `<label>`, owned by the component rather than by the page
that happens to render it. The `aria-label` is **removed**, not kept alongside:
an `aria-label` overrides a visible label, so leaving both means the invisible
one wins and the two can silently disagree.

> The text is "Search for a song", not the section framing "Know the song?".
> The visible label is now the accessible name, so it has to read sensibly out
> of context — a question does not.

Already correct, and checked rather than assumed: the mark is `aria-hidden`
inside a control with its own accessible name; touch targets clear 44×44 via
`tap-target`; reduced motion is handled globally; loading states use stable
skeletons with a live region.

### D-059 — There was no way home, and the link that was supposed to be one never worked
**Built 2026-08-23.** Raised by the reader: "it is hard to go to the homepage
from inside the lyrical page."

Correct, and worse than reported. D-056 shipped `.track-home` as "a persistent
way out". It was neither persistent nor available:

- **It was `display: none` below `sm`.** On a phone, a reader who opened a track
  had no way back to the catalogue at all beyond the browser's back button.
- **It was never actually fixed.** `position: fixed` was declared *before*
  `@include m.tap-target`, and that mixin sets `position: relative` to anchor
  its hit-area pseudo-element. The mixin won. The element computed to
  `relative`, sat in flow, and scrolled away with the hero — invisible as a bug,
  because at scroll offset 0 the two look identical.

> A silent-failure shape worth remembering: a longhand property overridden by a
> mixin included after it. Nothing warns, and the wrong result is correct-looking
> in the one state you screenshot. Found by reading the compiled rule rather
> than the source.

**The replacement is a masthead**, rendered once in the root document so every
route carries it in the same place. A way home that exists on some pages and not
others is not navigation; it is a link the reader has to re-find.

**The mark is three rules of unequal length** — a stanza, drawn rather than set.
It holds at 16px, which is what lets the compact form survive on the narrow
screens where the old link vanished: below `sm` the wordmark drops and the mark
does not, the reverse of the old behaviour.

> The mark is brass and does **not** follow the track. It is the one element
> outside `[data-track-scope]`, so the cascade does this anyway — but stated in
> both files, because an identity that repaints per record stops working as an
> identity, and the "fix" of pulling it into the scope would look like a
> correction.

**The two ways in are now presented together.** The search field and the mood
chips sat at opposite ends of the landing — field near the top, chips buried
inside the Deep Dives section. A reader without a song in mind had no way to
know the second route existed without scrolling past the thing they could not
use. Both are now one `.entry` section under the headline, split by a ruled
"or". The PRD's reasoning for the stepper — "a blank search bar is
intimidating" — does not stop applying on the second visit.

**The landing's eyebrow is gone.** It read "Typographic Lyrical Explorer"; the
masthead now carries the product name on every page, and repeating it directly
beneath itself was the same words twice.

> **Naming note:** the visible wordmark is "Lyrical Explorer". The full
> "Typographic Lyrical Explorer" remains the product name in `<title>`, the PRD
> and these docs. If the shorter form should not be the public name, the
> wordmark is one string in `masthead.tsx`.

Verified in the built server: the mark renders on `/`, on a track page and on
the 404; `aria-current="page"` appears only on the landing; at a 390px viewport
the mark is present where the old link rendered nothing.

### D-058 — The card was broken in production, and CJK broke it further
**Built 2026-08-23.** Resolves OD-027. Three faults, found by verifying D-057
rather than by trusting it.

**The Lyric Card never worked in a production build.** `harfbuzzjs` — satori's
text shaper — is an Emscripten module that reads `__dirname` to find `hb.wasm`
beside itself. Bundled into ESM there is no `__dirname`, so it threw at import
and took `/api/card` and `/api/og` down with it. Pre-existing, and confirmed so:
reproduced at HEAD on plain Latin text before any of D-057 was applied. It only
ever worked under `vite dev`, which is where it had been tested.

Fixed by externalising it, the same treatment `@resvg/resvg-js` already gets
(OD-018). A `__dirname` shim would only move the failure — the value has to
resolve to the package's own directory or the `.wasm` is not found either.

> This is the second time a native or wasm dependency has had to leave the
> bundle. Both are now in one place in `vite.config.ts` with the reason
> attached. A deployment target still has to ship `node_modules` for them.

**CJK then overflowed the card.** `measureEm` looked characters up in the
generated advance table and fell back to `FALLBACK_ADVANCE` — the mean of a
mostly-Latin face, about 0.56em — for anything missing. A full-width character
is 1em, so a Japanese line measured at roughly half its real width, the card
sized its type to fit a line twice as wide as it thought, and satori wrapped the
words off the bottom of the image. Invisible until D-057, because those same
characters were rendering as tofu boxes.

CJK is answered by range rather than enumerated: every glyph in a Noto CJK face
carries one advance — measured across 21k codepoints per face, 1em in JP and SC,
0.966em in KR — so three constants replace ~25,000 table entries. The generator
emits them from the measurement and **throws if a face stops being uniform**,
so the shortcut cannot quietly outlive its justification.

> Measuring also turned up that the Korean subset carries **no Hanja at all** —
> 21,058 of 32,324 sampled codepoints absent. Korean lyrics rarely use it, and
> the stack degrades to a system serif rather than to tofu, but the CSS range
> says more than the font delivers.

The twelve companion scripts were added to the generated table properly, so a
Tamil or Arabic card is sized from real advances instead of the Latin mean —
the same fault D-018 fixed for Devanagari, reintroduced for every script D-057
added. Arabic is over-estimated, because the cmap gives the isolated form and
joined medial forms are narrower; that errs toward type slightly too small,
which is the safe direction.

**The hero no longer disagrees with the lyrics.** D-057 left a known boundary:
text outside the canvas inherited the default CJK face, so a Han title on a
Chinese track was set in Japanese shapes. The track shell now carries
`data-script`, resolved from the lyrics.

> Deliberately **not** `lang`. The two are different claims. `lang="ja"` over a
> hero reading "Pretender · OFFICIAL HIGE DANDISM" is false — LRCLIB metadata is
> usually romanised — and a screen reader would voice the credit line in the
> wrong language. So `lang` stays on the canvas where it is true (D-053), and
> the typeface, which is an editorial choice about the whole page rather than an
> assertion about a run of text, gets its own attribute.

### D-057 — Twelve scripts had no typeface, and two of them were not on the list
**Built 2026-08-23.** Resolves OD-017.

Rufina covers **latin and latin-ext and nothing else** — read off its own
`unicode-range`, not assumed. Everything past that fell through, and the two
surfaces failed differently:

- **The exported card rendered literal tofu boxes.** Satori has no system fonts
  to fall back to, so an uncovered glyph has nowhere to go. Verified by
  rendering a Japanese card before the change and looking at it.
- **The reading view was quieter and less honest.** The stack ends in generic
  `serif`, so most systems substituted something — a face that matches neither
  Rufina nor the exported card, and that is simply absent on a machine without
  the script installed. OD-017 described both as "tofu"; only the card was.

**Cyrillic and Greek were broken too**, which the register never recorded. They
turned up by reading Rufina's coverage rather than trusting the list of what was
thought to be missing.

**Scope came from measurement, not intuition.** Sampling 519 LRCLIB tracks
across 28 artists: 67% carried a non-Latin script. Ranked — Devanagari 77, Han
75, Arabic 73, Kana 45, Hangul 32, Gurmukhi 32, Tamil 30, Thai 20, then a tail.

> A finding that reframes D-019: **LRCLIB stores most Hindi lyrics romanised.**
> "Tum Hi Ho" comes back pure Latin. The Devanagari face is exercised far less
> often than the catalogue's Hindi weighting suggests, while Han, Arabic and
> Kana — none of which had a face — were the three most common non-Latin
> scripts in the sample.

**Twelve faces, weight 400 only.** Nothing in the app sets `font-weight: 700` on
a display element, so a bold cut of each would double the bytes for a style
never requested; `<strong>` inside insight prose is synthesised, which is the
normal single-weight behaviour. Amiri for Arabic rather than Noto Naskh: D-019
chose Vesper Libre because "transitional sits closer to Rufina's contrast than
a humanist face would", and Amiri — a classical naskh revival off the Bulaq
Press types — is that same argument in Arabic.

**The faces are declared by hand, not imported.** fontsource's per-subset
stylesheets (`amiri/arabic-400.css`) ship **no `unicode-range`**, so the browser
cannot rule a face out without first downloading it — one stray character
Rufina lacks could pull a megabyte of Korean onto an English page. The
whole-package `400.css` files do carry ranges, but cost ~100KB of
render-blocking CSS each for the CJK three, paid by every reader including
Latin-only ones. Declaring the faces directly costs 8KB of source and states the
ranges exactly.

> The existing comment claiming "each import carries per-subset unicode-range"
> was wrong, and had been since D-019 — `vesper-libre/devanagari-400.css` never
> carried one either. Corrected, and Vesper Libre moved to the same explicit
> declaration.

**CJK is chosen by language, not by glyph.** Japanese, Chinese and Korean share
U+4E00-9FFF and draw those codepoints differently. Per-glyph fallback would hand
every Han character to whichever face sat first in the stack, so a Chinese
lyric would silently set in Japanese shapes. `--font-cjk` is resolved by
`:lang()` instead, reusing the detector D-053 already runs, and the card
renderer picks its CJK binary the same way — so page and card agree on regional
shapes as well as on typeface. It also means only one CJK face is ever
reachable, which is what keeps the download to one file.

> **Written wrong the first time.** The rules were `:root:lang(zh)`, which can
> never match: D-053 puts the language on the lyric canvas, not on `<html>`,
> because the language is read off words that arrive deferred, after the shell
> has been sent. `<html>` stays `lang="en"`. Caught by checking which element
> actually carries the attribute — the first check, that the rules were
> unlayered and correctly ordered, was true and beside the point.

**Known boundary:** text outside the canvas — hero title, credit line —
inherits the `:root` default, so a Han title on a Chinese track is set in
Japanese shapes. Rare, because LRCLIB metadata is usually romanised, and fixing
it properly means labelling the language above the canvas, which the deferred
load prevents.

**Cost.** 8KB of source CSS; nothing extra downloaded on a Latin page. A
non-Latin page fetches one file: 12KB (Hebrew, Cyrillic, Greek) to 140KB
(Arabic), or 0.9–1.5MB for CJK. Server-side the small faces load together;
the CJK binaries are read lazily, one per language actually asked for, because
holding all three costs ~6MB resident for a route most cards never take.

**The tables are asserted, not trusted.** Fifteen hand-typed paths, where a
typo throws only when a reader exports a card in that script — in production,
for the reader least likely to report it. `fonts.test.ts` checks every path
against the filesystem, that every face is `.woff` (satori cannot parse woff2),
and that every language `detectLang` can return has a face. Mutation-tested:
a typo'd path, a `.woff2` path, and adding a detectable script without a face
each fail exactly one test.

Verified in Firefox against the production stylesheet: `lang="ja"` and
`lang="zh"` render visibly different forms of 骨 and 雪 from the same markup.

### D-056 — The landing treated every visit as a first visit
**Built 2026-08-23.** The entry-flow rework, approved from a written proposal.
The track page is deliberately untouched apart from one link.

**What the audit found**, by reading the code rather than by judgement:

| | evidence |
|---|---|
| Nothing is remembered | `tle:preferences` was the only key in the codebase |
| An empty search says nothing | `isOpen = enabled && results.length > 0` |
| The way out is at the bottom | the sole exit link lived in the track footer |
| Taste is all-or-nothing | `reset()` cleared all three answers |
| Two doors, one visible | 59 curated tracks vs all of LRCLIB, undistinguished |

**The change in one sentence: the landing should differ on the second visit.**
A reader on their twentieth visit saw exactly what they saw on their first,
minus the questions.

**Continue reading.** Track id, title and artist, newest first, capped at five,
in the reader's own browser. Recorded when the page opens — not when they
scroll, not when they finish: someone who opened a song and left still wants to
find it again.

> **No scroll position, deliberately.** Lyric lines reflow with viewport width
> and with the drawer open, so a stored offset points somewhere else on the
> next visit — and being returned to roughly-but-not-quite where you left off
> is worse than starting at the top of a page you chose to reopen.
>
> Storage is parsed, never trusted, by the same rule as the preference
> signature (D-047): it is user-writable and survives across versions of this
> code. Incomplete rows are dropped rather than repaired, duplicate ids are
> collapsed (two rows with one key breaks React), and the cap is enforced on
> **read** as well as write, since an older build could have stored more.

**Per-row removal, not only a bulk clear.** What someone has read is personal,
and taking one thing off the shelf should not cost them the rest of it. The
control is always visible rather than revealed on hover — a hover-only control
does not exist on a touch screen, and this is the only way to drop a row.

**The shelf renders nothing when empty.** A first visit is exactly as it was.
An empty shelf explaining what would eventually appear there is chrome charging
rent for a feature the reader has not used.

**Taste chips replace "Change taste".** Editing one axis used to mean
re-answering all three. The chips also make the answers *visible* — after the
stepper closed they were invisible, so the cards said "for longing, the
honesty" with nothing on the page confirming that is what the reader asked for.
The stepper itself is unchanged: it answers the PRD's "a blank search bar is
intimidating" and does it well. The problem was never the first visit.

**The empty search state introduced a bug I had to fix in the same pass.**
Opening the panel with zero results meant `onKeyDown` still ran its arrow
handling, and `(i + 1) % 0` is `NaN` — with `aria-activedescendant` pointing at
a row that does not exist. The guard now tests rows rather than the panel, and
Escape is handled before it so clearing the field still works.

**The way home** takes `--discover-bottom`, the offset the shell already
resolves for everything on the bottom edge, so it rises with the docked bar and
the drawer sheet without knowing anything about either. Left edge: the right is
the Discover button's, and two things in one corner is precisely what D-033
was about. Hidden below `sm`, where the bar and the button already crowd that
edge — the footer link is still there, so nothing is lost.

**Copy.** Both doors now say what they are. Three picks out of a hand-built
catalogue is an editorial claim, and unlabelled it read as the whole of a thin
library; the search field says "any song or artist" because it reaches
everything LRCLIB holds and nothing on the page said so.

### D-055 — The player did not exist for the first four seconds
**Fixed 2026-08-23.** Reported as: tracks the reader has not opened before
struggle to show the player. Uncached tracks, so this was the cold path.

**The player was not slow. It was absent.** It sat behind
`<Await promise={visuals} fallback={null}>`, and `null` is the whole story:
until the Genius chain settled there was no bar in the document at all. Then it
appeared and pushed the page down. Measured cold, that wait was **3.0–4.4s**.

**Where the time went.** Genius, entirely — the palette costs 40–285ms. And
within Genius, one call dominates:

| call | time | payload |
|---|---|---|
| `/search` | ~0.85s | 18 KB |
| `/songs/{id}` | **~2.4s** | **120 KB** |

`/songs/{id}` returns the full song object — description, annotations, ad
configuration — and we read **one field** from it, `media`. `text_format` does
not shrink it; measured at 118 KB against 120.

So the media lookup is now its own operation on its own cache key, for exactly
the reason D-017 split lyrics from visuals: it is three times slower than
everything it was travelling with, and bundling made the fast thing wait for
the slow one. `getTrackVisuals` keeps artwork and palette; `getTrackPlayback`
carries the video id. Both share the `genius:` search entry, so the search half
is still paid for once.

**And the bar now mounts on the first paint**, in a resolving state, filling in
as each half lands. Measured on the production build, cold:

| | before | after |
|---|---|---|
| player UI in the document | 3.3–4.9s | **0.34–0.64s** |
| artwork | 3.3–4.9s | **1.35–2.29s** |
| video id | 3.3–4.9s | 3.29–4.86s |

> **The dev server does not stream, and that cost an hour.** Probed over a raw
> socket, `vite dev` returns first byte and last byte at the same instant —
> 3.04s, whole document at once — which reads exactly like `defer()` being
> broken. It is not: the production build streams first byte at 0.3s and
> appends each promise as it settles. Measure streaming against `.output`, not
> against dev.
>
> A second trap in the same session: `node .output/server/index.mjs` does
> **not** read `.env` the way `bun` does. The first production run had no
> Genius token, so `features.artwork` was false, no upstream call was made, and
> the timings looked wonderful. Load the env explicitly before believing a
> production measurement.

**A null video id is now a sentence, not an absence.** Genius does not know a
video for every song — "Nights" by Frank Ocean, for one. That used to render
nothing whatsoever. The bar now distinguishes three cases it previously
collapsed into one: *Finding the recording* while the lookup runs, *No
recording found* when it returns empty, and the failure reasons from D-054 when
playback itself breaks. The first offers nothing, because waiting is correct;
the other two offer a link out.

`findSong` and `GeniusResult` were removed rather than left beside the split —
a second path that nothing calls is a second path free to drift.

Cache keys: `genius:v2` → `v3` (search half only now), `visuals:v3` → `v4`
(shape changed), and a new `playback:v1`.

### D-054 — "Loading" was the only thing playback could ever say
**Fixed 2026-08-22.** Reported with a screenshot: "Wish You Were Here" stuck on
LOADING beside an empty black rectangle.

**The player had no failure path at all.** `notice = !ready ? "Loading"`, and
`ready` was set in exactly one place — `onReady`. There was no `onError`
handler, no timeout on the API script, no timeout on the player, and no
`unavailable` state anywhere. So *every* way this can fail rendered as a
spinner that never resolves: a blocked script, a removed video, an embed the
rights holder restricted, a dead connection. The reader is told the same thing
in all of them, which is nothing.

**The structural bug: React and the IFrame API both owned the same node.**

`new YT.Player(el)` does not render *into* the element it is handed — it
**replaces** it with an iframe, and `destroy()` then removes what it put there.
The element passed was React-rendered:

```tsx
<div className="playback__video">
  <div ref={mountRef} />        {/* React owns this; YouTube deletes it */}
</div>
```

React keeps a reference to a node that is no longer in the document, and any
remount builds the player against a detached element — so the iframe is never
in the page and `onReady` never fires. A permanent "Loading" beside an empty
black box is precisely what that looks like, which is precisely what was
reported.

`mountRef` is now a stable container React owns and never writes into; the node
YouTube destroys is created imperatively inside it. The container is **never
conditionally unmounted**, because tearing it down while the iframe is inside
would restore the same conflict — instead the hook empties it on failure and
`.playback__video:empty { display: none }` removes the black box.

**What now happens instead:**

| failure | before | after |
|---|---|---|
| API script blocked | hangs forever | 8s timeout, then a reason |
| player never starts | hangs forever | 12s timeout, then a reason |
| owner blocks embedding (101/150) | hangs forever | says so, offers the link |
| video removed (100) | hangs forever | says so |
| unknown code | hangs forever | "playback failed" |

A failed `loadApi()` promise is no longer cached: one blocked request used to
poison every later track in the session, since the module-level promise was
kept whatever it settled to.

Polling moved inside `onReady`. `YT.Player` methods are not callable before the
player is ready, so `getCurrentTime()` was throwing on every 250ms tick from
the moment the constructor returned.

> **The fallback is a link, not a retry.** When the embed is refused the reader
> still wants the song, and YouTube will play it on its own site — that is also
> the outcome the rights holder chose. Retrying an embed the owner has
> restricted would just fail again more slowly.

**What could not be verified here.** No browser automation is available in this
environment, so the fixes are reasoned from the API's documented behaviour and
the screenshot, and the error-code mapping is unit-tested for totality — every
code, documented or not, yields a sentence. Whether *this particular* video
embeds is a decision on YouTube's side that cannot be read from the server: the
embed page for a working track and this one are byte-identical on every
playability field, both returning a generic `previewPlayabilityStatus: ERROR`
to a non-browser client. If it turns out to be 101/150, the bar will now say so
and offer the link, which is the correct outcome rather than a fix.

### D-053 — What the checklists missed: contrast, focus, language, crawlers
**Fixed 2026-08-22.** A deeper audit than D-051 and D-052, which both worked
from design checklists. This one measured.

**Two contrast failures, both computed rather than eyeballed.**

`--color-ink-faint` carries `text-micro` — 12px section labels, kickers, the
playback clock — which is nowhere near WCAG's large-text threshold, so it needs
the full 4.5:1:

| background | before | after |
|---|---|---|
| canvas | 4.14 **fail** | 5.31 pass |
| surface | 3.91 **fail** | 5.00 pass |
| surface-raised | 3.52 **fail** | 4.51 pass |

Solved against the *worst* background rather than the one it was first checked
on, so `0.55 → 0.61` passes everywhere the token is used.

Worse, and easy to miss because it is a state rather than a colour: the
scroll-spy dims inactive stanzas to `opacity: 0.2`. Composited over the canvas
that is **1.68:1** — below even the 3:1 large-text floor, which made every line
the reader was not currently on unreadable rather than merely quiet. That is
most of the page, most of the time. `0.38` is the lowest value that clears it,
at 3.28:1; the active line is still five times brighter, so the emphasis
survives and the verse can now be scanned without scrolling through it.
`prefers-contrast` idle rises 0.42 → 0.55 to keep a real gap above the new
default.

**The drawer had no focus management at all.** `focus()`, `inert` and
`tabIndex` appeared nowhere in the codebase. A keyboard reader pressed
"Discover the story", the panel opened behind them, and Tab carried on through
the lyrics underneath — the content they asked for was unreachable. The panel
now takes focus on open and hands it back on close, but only if focus is still
inside it, so a reader who deliberately clicked elsewhere is not yanked back.

The desktop panel also gains `role="dialog"` and `aria-modal`, because it locks
the page behind it and therefore *is* modal. The mobile sheet deliberately
leaves the lyrics scrollable (PRD §3.5) and so is deliberately **not** marked
modal — one component, two honest sets of semantics.

**`<html lang="en">` was a lie for every non-Latin track.** The product ships a
Devanagari face precisely because it expects Hindi lyrics (D-019), then told
every screen reader those lyrics were English — which makes a speech
synthesiser produce noise rather than accented Hindi. `detectLang` reads the
script off the words themselves, since LRCLIB carries no language field.

> **Script is not language,** and the implementation says so. Devanagari carries
> Hindi, Marathi and Nepali; the function returns the most widely read language
> for a script and no more. Latin is deliberately absent — English, Spanish and
> Turkish are indistinguishable by script, and guessing would trade a correct
> default for a coin flip. A 20% share is required so a borrowed word cannot
> flip the page.
>
> Japanese needed its own rule. Written prose is usually majority-Han with kana
> carrying the particles, so picking the higher count returns Chinese. Kana are
> exclusive to Japanese, so one settles it — caught by a test that failed
> against my own comment claiming the opposite.

**Crawlers.** No canonical, no robots, no sitemap, no structured data. A lyrics
page is exactly what `MusicRecording` describes, and without it a search engine
sees a headline and a wall of unattributed text.

> The schema's `lyrics` property is deliberately **omitted**. The words are
> LRCLIB's user-contributed transcriptions of someone else's copyrighted work;
> displaying them to a reader who navigated here is the product, and publishing
> the full text as machine-readable data for anyone to ingest is a different
> act. `robots.txt` is a route, not a static file, because `Sitemap:` must be an
> absolute URL and a relative one is ignored — the same trap as og:image in
> D-051. The sitemap lists the 56 curated tracks, not everything LRCLIB holds:
> those are millions of pages this product does not own.

**One server-side fetch was unguarded.** `extractPalette` took a URL out of a
Genius API response and fetched it from the server with no validation — the
shape of an SSRF. A compromised or merely buggy upstream could have pointed it
at `http://169.254.169.254/…` and had us read cloud instance metadata on its
behalf. Now an allowlist of Genius image hosts plus https-only, because the set
of addresses that must not be reachable is open-ended while the set of hosts
that legitimately serve this artwork is small and known. Verified against five
live lookups; all resolve to `images.genius.com`. It does not defeat DNS
rebinding, which would need resolution-time checks the platform does not
expose.

Also: `aria-controls` on the trigger, a live region on its label (generation
takes seconds — D-050 — and silence reads as breakage), `<output>` for the
search status, and the drag grip hidden from assistive technology since it is a
pointer affordance with no keyboard equivalent and Escape already closes.

**Measured and left alone.** Client JS is 558 KB raw / ~180 KB gzipped, of
which framer-motion is 147 KB raw / 47 KB gz on the landing route. Fonts are
correctly subset — 10 `unicode-range` declarations, so the Devanagari faces are
only fetched by a reader who needs them. Not worth trading for now; recorded so
the next person does not re-measure it.

### D-052 — The page is printed in the record's ink
**Decided 2026-08-22.** A second design pass, against the official
`frontend-design` skill rather than the generic redesign checklist. It asks a
harder question: not "is this polished" but "would this be mistaken for anyone
else's".

**The fingerprint.** That skill names the three looks generative design falls
into regardless of subject. The second is *a near-black background with a
single bright acid-green or vermilion accent*. Ours was
`--color-canvas: oklch(0.13 0.008 265)` with `--track-accent: oklch(0.72 0.16
32)`. That is the default, exactly.

**The waste.** Palette extraction — the most distinctive thing this product
does — wrote three variables: `--track-accent`, `--track-accent-soft`,
`--track-glow`. Canvas, surfaces and hairlines were the same near-black at hue
265 for every record ever opened. The record's colour was spent on chips and
underlines while the page it sat on never moved.

So the signature is the mechanic that already existed, carried the rest of the
way: **the paper takes the record's hue, not just the marks.** `Palette` gains
`canvas`, `surface`, `surfaceRaised` and `hairline`, and a track page is
visibly that record's page.

> **Tinting cannot change a contrast ratio.** OKLCH lightness is perceptual, so
> the paper values reuse the default lightnesses verbatim — 0.13, 0.175, 0.225 —
> and move only hue and chroma. Ink is untouched. `palette.test.ts` asserts the
> lightness of all three surfaces across a saturated red, a saturated blue, a
> pale wash and a muted earth tone.

Surface chroma is capped near a seventh of an accent's, and taken as
`min(cover, ceiling)` rather than clamped up: area multiplies chroma, so at
accent strength the page would compete with the artwork in the hero instead of
framing it — and a muted cover should tint less, not be pushed to a saturation
its artwork never had.

**Paper is set on `<body>`, not on the article.** Custom properties inherit
downward and the page background is painted from body's own computed value, so
tinting the article would repaint every panel inside it and leave the page
behind them unchanged — the one combination that reads as a bug.
`body:has([data-track-scope="…"])` scores (0,1,1) against the (0,1,0) that
`@theme` emits at `:root`, so it wins on specificity rather than source order.
That distinction matters: the rule mounts after first paint (D-017), and
relying on order would make the result depend on where React placed it.

**The default accent is brass**, `oklch(0.72 0.13 82)` — foil stamping on a
sleeve, the label at the centre of a record. Drawn from the subject's own
materials rather than picked off a palette, which is the whole complaint
against vermilion. `FALLBACK_HUE` in `card.ts` moves with it, so an exported
card and the page it came from cannot disagree about the product's colour.

> **The cache caught me, exactly as documented.** The paper rule did not render
> on first test: `Palette` had changed shape, `visuals:` still held pre-change
> objects, and `PaletteStyle` refuses a partial palette — so a stale entry
> rendered the old untinted page with no error anywhere. `visuals:v2` → `v3`.
> This is the D-049 checklist item working on the person who wrote it.

Rejected: warming the neutrals off 265 wholesale, and editorial furniture
(drop caps, folios, running heads). The skill's own advice applies — spend
boldness in one place and remove one accessory before leaving. The tinting is
the one place.

### D-051 — Grain, tinted elevation, and the card as a social object
**Decided 2026-08-22.** A design audit against the `redesign-existing-projects`
checklist. Most of it already passed — the serif/sans pairing, the tinted
off-black, the single runtime accent, one gray family, the `--layer-*` scale,
the focus ring, `tabular-nums`, `text-wrap`. What follows is what it actually
found.

**Texture.** Every surface was flat. A flat dark field reads as a screen; a
grained one reads as a printed page, which is the premise of the product. The
grain is an `feTurbulence` data URI on `body::after` — no request, tiles
seamlessly via `stitchTiles`, sharp at any density — held at `0.045` opacity,
`position: fixed` so it belongs to the viewport rather than the document. Grain
that scrolls with the page crawls, which is the one thing film grain must not
do. It takes `--layer-grain: 70`, above modals, and is inert by construction.

**Elevation was neutral black.** A pure-black shadow on a canvas tinted at hue
265 desaturates whatever it falls on and reads as a grey object rather than as
absence of light. Three tinted steps replace it, plus `--shadow-sheet`, which
casts *upward* — the insights sheet is anchored to the bottom edge, and reusing
the downward scale there lit it from below. Caught by reading the rule it
replaced, not by looking at it.

**Glass had no thickness.** A single flat 1px border renders a cut-out. Two
insets — a sheen on the top edge, a shade inside the lower — render a pane.

**The hero met the viewport edge at full strength**, so the artwork read as a
photo pasted onto the page rather than printed on it. An elliptical corner
vignette joins the existing veil stack; ellipse rather than circle so it tracks
the aspect ratio instead of pinching on a wide display.

**The real gap was social.** The product ships a Lyric Card rasteriser and had
never wired it to sharing: no `og:image`, no `twitter:card`, no favicon, no
`public/` directory at all. A shared track link previewed as a bare URL — a poor
argument from a product whose whole claim is that lyrics deserve to be set
properly.

`/api/card` could not serve it: it is POST, because a six-line verse does not
fit in a URL, and a crawler only ever issues a GET. So `/api/og?trackId=` is a
second entry point onto the *same renderer* — the preview is the same object as
the export, which is the point.

> **og:image must be absolute.** The first version emitted
> `/api/og?trackId=…` and would have shipped broken: crawlers drop a relative
> og:image rather than resolving it against the page. `SITE_URL` is read
> through `env.ts` like every other variable and reaches `head()` through the
> loader — a server function rather than `import.meta.env`, because a second
> mechanism for reading configuration costs more than one call on a
> client-side navigation that nothing is waiting on. Unset, it degrades to a
> relative URL: wrong for a crawler, correct in local development.

**Accessibility.** A skip link (a track page is one long scroll of lyrics, and
`<main>`/`<article>` had no id to skip to) and `prefers-contrast: more`, which
lifts the two quietest inks, firms every hairline, and drops the grain to zero —
texture costs contrast, and a reader asking for contrast should not pay for it.

> The contrast block is **unlayered**, deliberately. `@theme` emits the same
> custom properties into `:root` outside any cascade layer, and layered CSS
> loses to unlayered CSS whatever the specificity — so inside `@layer base` the
> override would have been silently dead. Verified in the compiled CSS: the
> base value lands at byte 2,609 unlayered, the override at 26,649, also
> unlayered and later. Same trap as D-003 and D-033.

Rejected: warming the neutrals off hue 265, and adding editorial furniture
(drop caps, folios, running heads). Both were offered and neither was taken —
the palette is cool so album-derived accents stay dominant, and that reasoning
still holds.

### D-050 — DeepSeek primary, Gemini fallback, and the reasoning tax
**Decided 2026-08-22.** Replaces Gemini as the drawer's writer (OD-003).

Gemini's free tier allows 20 requests a day. Because the cache key includes the
reader's taste signature (D-047), that is 20 *(track, answer-set)* pairs, not
20 tracks — a third visitor with different answers could exhaust it on a single
song. OD-021 called this a launch blocker and it was.

DeepSeek is metered: **~$0.0001 an insight**, so $10 buys on the order of
100,000 of them. That alone decides the provider.

**What it costs us: no schema enforcement.** Gemini takes a `responseSchema`
and guarantees the shape. DeepSeek's `response_format` accepts `json_object`
only and rejects `json_schema` outright — *"This response_format type is
unavailable now"*. That matters more than it sounds, because D-029 established
that making paragraphs structural is the only reason the synthesis is not a
wall of text.

Measured over 8 runs of the real prompt, identical but for the shape contract:

| | `synthesis` is a 2–3 element array | median latency |
|---|---|---|
| Shape described in prose only | **0/8** | 43.8s |
| Shape described in the prompt | **8/8** | 19.4s |

So the schema moves into the prompt (`SHAPE_CONTRACT`), and `toInsight` coerces
rather than trusts — a bare string is split on blank lines, non-string elements
are dropped. The verbatim gates are unchanged, because they never trusted the
model in the first place. That is the payoff for having built them that way.

**The reasoning tax.** The first sequential measurements were far worse than the
concurrent ones: a median of 47s and a worst case of 59s, which the 25s timeout
would have thrown away. The cause was visible in `usage`: 2,700–7,600
*reasoning* tokens to produce 100–190 words of prose. `deepseek-v4-flash` is a
reasoning model and was deliberating over a task with nothing to deliberate
about — the song, the sources and the required shape are all given.

| | reasoning tokens | median | gates passed |
|---|---|---|---|
| Default | 2,700–7,600 | 32.3s | 3/3 |
| `reasoning_effort: "minimal"` | 2,700–5,100 | 25.1s | 3/3 |
| `thinking: {type: "disabled"}` | **0** | **5.4s** | **8/8** |

Thinking off is a **6× speedup and a ~7× cost reduction for no measured loss**
on any gate — shape, verbatim lyrics, or grounded quote. `reasoning_effort`
is not a substitute; it barely moved. The drawer lands at 5.4s median, inside
PRD §4's 3–6s budget and level with the Gemini it replaces.

**Why Gemini stays.** Not for quality — as a second failure domain. DeepSeek is
one company in one region, and a silent drawer is a visible hole. The two are
tried in sequence, not raced: the fallback covers an outage, and racing would
double the spend on every cold insight to save time nobody is waiting on.

The cost is one more adapter to keep in step, so the prompt and every gate moved
into `providers/insight.ts`, which neither adapter can bypass. An adapter now
chooses only *how* it talks to a model, never *what* it asks for or *which*
answers get through. `gemini.server.ts` fell from 353 lines to 91.

`insight:v3` → `v4`: the copy budget changes what gets written, and 30-day
entries would otherwise keep serving the old length (the D-049 lesson).

Verified by mutation after the move: neutering the resonance lyric check fails
3 tests and the quote verbatim check 3, unchanged from before the refactor —
the gates were carried across intact, not merely copied. Neutering the string
coercion fails 1, which is the whole of its unique behaviour; the null and
non-string-element paths are covered by other cases and are equivalent under
that mutation.

Verified live end-to-end: 6.2s, synthesis in 2 paragraphs, quote kept and
grounded, resonance kept with both lines matching the lyrics. The fallback was
exercised by pointing DeepSeek at an invalid key — it logged, fell through, and
Gemini returned a 163-word insight.

### D-049 — Channel uploads, and the caches that outlived their fixes
**Fixed 2026-08-22.** Reported with a screenshot: no player on the track page.

**Two faults, one screenshot.**

**The player.** LRCLIB entry `34264408` is a YouTube lyric-channel upload:

| field | value |
|---|---|
| `trackName` | `Childish Gambino - Redbone` |
| `artistName` | `7clouds` — the channel, not the artist |
| `albumName` | `Childish Gambino - Redbone` |

Genius was therefore asked for *"Childish Gambino - Redbone" by "7clouds"*,
scored below `MATCH_THRESHOLD`, and returned nothing. That costs the artwork
**and the player**, because the YouTube id rides along with the Genius match
(D-022). `normaliseNames` could not help: it strips the artist it was *given*,
and that artist appears nowhere in the title.

`findArtwork` now retries with the other readings of the title when the
primary lookup misses. Both orderings are offered, because neither is reliably
true — "Artist - Title" is the YouTube convention, "Title - Artist" is common
in user uploads. **Genius adjudicates; we only propose.** For the reported
track the retry scores `1.0` and yields `k49I5m1J6Is`, which resolves to
*Redbone* by *Childish Gambino*.

Bounded deliberately: only on failure, at most two extra requests, and only at
a **top-level** separator. "Come and Get Your Love (Single Edit - Audio)"
would otherwise split inside the parenthetical and spend two requests on
nonsense against rate limits nobody has documented (OD-014). Candidates are
also skipped when the recorded artist is already one of the halves, since
`normaliseNames` has answered that.

**The stale caches — the more embarrassing half.** The same screenshot showed
`7clouds · Childish Gambino - Redbone`, an album echo that `meaningfulAlbum`
already rejects. Tested directly, it returned `null`. The API returned the old
value because **`track:` had been serving a 30-day entry parsed before the fix
existed**.

D-043 and D-047 both bumped the key they touched. Neither bumped `track:`,
`visuals:` or `search:`, and `visuals:` wraps `genius:` — so bumping only the
inner key would have left the outer entry still serving the old empty result.
All four are now versioned.

> **A fix to parsing is not deployed until the cache that stores its output is
> versioned.** Thirty days is long enough that every reader who has opened a
> track keeps the old bug while the new code sits in the repo looking correct.
> Bump the key in the same commit as the parse change.

### D-048 — Two scrollbars, and type twice too large for its column
**Fixed 2026-08-22.** Reported with a screenshot: two scrollbars against the
right edge, an ask to find a better representation, and type large enough to
force the reader to scroll for everything.

**The type was the root of it, and it is measurable.** The synthesis was set
at `--text-lead` (up to 22px) in a 30rem panel, which is **39 characters to
the line** against an editorial target of 60–75. Half a normal measure means
roughly twice the height for the same words, which is what made the drawer
read as a wall and scroll forever.

Two changes, because neither alone reaches the target:

| | Measure |
|---|---|
| 30rem @ 22px — before | 39 characters |
| 30rem @ 16px | 53 |
| **38rem @ 16px — now** | **69** |

`--text-lead` is a size for a standfirst: one or two sentences introducing
something. It is the wrong size for several hundred words in a column, and it
stays on the pull-quote and the quoted lyric lines, where it belongs.

**Two scrollbars.** The panel is its own scroll container and the page behind
it kept scrolling too, so both bars sat against the same viewport edge and
read as a rendering fault rather than as two regions. The document is now
locked while the desktop panel is open, with `scrollbar-gutter: stable` on
`html` so locking cannot shift the layout sideways under the reader.

Desktop only. On mobile the sheet covers the bottom half by design and the
lyrics above stay scrollable, which PRD §3.5 asks for explicitly.

**Representation.** Four prose blocks 2.5rem apart read as one column that
happens to have small grey headings in it. The first attempt put a hairline
between sections — and needed `!important` to stop it doubling the personal
slot's own card border, which is the tell that the approach was wrong. The
section labels now carry the separation instead: accent-coloured and
semibold. A label that announces itself is a better boundary than a rule, and
it adds no chrome to a reading panel.

### D-047 — The drawer is written to the reader
**Decided 2026-08-22.** Asked: put the explanation inside the song's page, in
the Discover drawer, and make it personal — pointing at the lines in *this*
song that meet what the reader said they wanted, at length rather than in a
line.

A new slot, **"Why this, for you"**, sits above the artist quote: it is the
reason this reader is here, and the quote is context that follows.

**This reverses part of D-045, deliberately.** There the argument against the
model was that it would be justifying a decision it had no part in — the
picker is a weighted score, and a rationale written afterwards is
confabulation. Here the task is different: *"the reader is drawn to longing;
show them where this song does that."* That is analysis grounded in the
lyrics, not a post-hoc story about an algorithm. The shelf explanation stays
derived from `score`; only the drawer, which is about the song rather than
about the pick, is written by the model.

**The lines are gated against the lyrics.** `validateResonance` requires every
quoted line to appear in the track's own lyrics, folded for punctuation and
spacing. One bad line discards the whole passage — a paragraph pointing at a
line the reader will not find is worse than no paragraph, and it makes the
rest of the drawer untrustworthy by association. Same rule as the artist
quote (D-030), same reason.

Verified by mutation: removing the lyrics check fails 3 tests, keeping the
passage and dropping only the offending line fails 3, removing the length
floor fails 1.

> **The cache key now carries the answers.** `insight:v3:{signature}:…`. Two
> readers who answered differently must not share a passage written to one of
> them. Readers who answered the same still share, and everyone who skipped
> the stepper shares the `none` entry — the common case, and the cheapest.
>
> The cost is real: OD-021's twenty-a-day quota no longer buys twenty *tracks*
> but twenty *(track, answer-set)* pairs. Accepted knowingly; it makes the
> launch blocker sharper, not new.
>
> **Superseded by D-050.** The quota belonged to Gemini, which is now only the
> fallback. On a metered provider the multiplier costs about a hundredth of a
> cent per pair rather than a share of a hard daily cap.

> **The signature is validated against the enums at every entry point.** It
> reaches a cache key, and every miss is a paid model call, so an unbounded value
> would let a caller mint entries at will. `parsePreferences` for query
> strings and `normalisePreferences` for objects both drop anything not in
> `MOODS`, `PULLS` or `FAMILIARITIES`. Verified live: junk falls back to
> `none` rather than creating an entry.

> **Nothing is asked for when nothing was answered.** The personal section is
> left out of the prompt entirely rather than requested and discarded, so the
> model is never asked to write to a person it knows nothing about. The
> request also waits for `answered !== null`, so a generation is never spent
> before localStorage has been read.

The prompt instructs the model to say so plainly when a song does *not* do
what the reader asked for. Observed working: asked for a deep cut, the note on
"In My Life" opens by conceding it is "far from a hidden gem".

### D-046 — Two labels that should have matched, and a reason nobody could see
**Fixed 2026-08-22.** Reported: make "The Synthesis" and "The Sources" match,
and — where is the explanation?

**The labels.** Both carry the same two classes, so they should have been
identical. `.insights__synthesis p` was a descendant selector, and the section
label is itself a `<p>` inside that section: at (0,1,1) it beat
`.insights__label` at (0,1,0) and overrode the label's colour with
`--color-ink`. One label set in ink, the other in faint, from a rule that was
never meant to touch either. The prose now has its own `__prose` class, so the
paragraph styling can only reach paragraphs.

> The general form: **a descendant selector claims everything of that element
> type inside a region.** Scope prose styling to the prose, not to the section
> that contains it.

**The explanation.** It was rendered inside the card's text column and hidden
below `sm`, because on a phone that column sits beside the artwork and there
was no room. Hiding it there was the wrong answer to a layout problem — the
reason a song was recommended is not a large-screen luxury.

The card is now a column at every width, with the art and the name as a
`__head` row inside it and the reason as a sibling beneath. It spans the whole
card and shows everywhere. On a phone the head stays horizontal; from `sm` it
becomes a portrait tile as before.

### D-045 — The recommendation explains itself, truthfully
**Decided 2026-08-22.** Asked: explain why a song was recommended, from the
reader's answers and the song's meaning.

**The explanation is derived from the scoring, not written alongside it.**
`explainPick` walks the same conditions as `score`, in the same weight order,
so `matched` lists the axes that actually earned points. An explanation
maintained separately would drift from the picker the first time a weight
changed, and a reader would have no way to tell.

**Gemini was considered and rejected.** The picker is a deterministic weighted
score; a model asked to justify a pick never saw that scoring and would be
inventing a plausible rationale after the fact. That is the same class of
failure as an unsourced quote (D-021), on a feature whose entire value is
being believable. It would also cost up to fifteen calls per visit against a
twenty-per-day quota (OD-021) — exhausted by the second visitor.

**The song half is written, not generated.** Every one of the 56 catalogue
tracks now carries a `note`: one line on what the song *does*, present tense,
no title-dropping. A test enforces that every note exists, clears twenty
characters, and does not open by restating the title.

> **Shown as chips, not a sentence.** Measured across 192 preference-and-seed
> combinations, all three picks share identical reasons 42% of the time.
> "For longing, the honesty and deep cuts" printed three times reads as a
> stutter; the same words as tags read as classification, which is what they
> are. A shelf-level line was rejected for the mirror reason — the reasons
> differ between picks **58%** of the time, so one heading would be wrong more
> often than right.

> **No match is not a failure.** A reader who skipped the stepper sees
> "today's rotation", because the pick genuinely came from the day's shuffle.
> Claiming a reason there would be the lie this decision exists to avoid.

Verified by mutation: claiming an unmatched mood fails 2 tests, blanking one
note fails 1. Removing the `"surprise"` guard survives — an **equivalent
mutant**, since a track's `familiarity` is typed to exclude `"surprise"`, so
the comparison is already false. `score` carries the same defensive guard.

### D-044 — The synthesis is set in the sans
**Decided 2026-08-22.** Asked: use Elms Sans for the paragraph.

The synthesis was set in Rufina. The display face is cut for headlines, and at
`--text-lead` in a 30rem drawer it sets heavy and slows the line — the drawer
is prose to be read at length, not a title.

The quote was previously distinguished from the synthesis by a serif→sans
shift. Now that both are sans, the accent rule and the attribution carry that
job alone, which they already did most of.

### D-043 — Sources are a reference list, not a carousel
**Fixed 2026-08-22.** Reported with a screenshot: a horizontal scrollbar in the
insights panel, and an ask to find a sensible way to show this data.

**The bug.** `.insights__sources` bled to the panel edges with
`margin-inline: -1.75rem`, cancelling the panel's own `1.75rem` padding. That
made it 3.5rem wider than the panel's content box — and because `.drawer-panel`
sets `overflow-y: auto`, CSS computes the other axis from `visible` to `auto`,
so the panel grew a horizontal scrollbar. The scrollbar in the screenshot
starts at the panel's left edge, not the page's, which is the tell.

**The redesign.** A horizontal, swipeable gallery is what PRD §3.5 asks for,
and it is wrong here. Inside a 30rem reading column it puts a second scroll
axis across a vertical one, gives each source a 13rem card for what is a link
and a headline, and shows two or three sources at a time out of six.

The sources are now a **numbered reference list**, which is what an editorial
product does with its sources. The numbering is not decoration: the quote
already carries a `sourceIndex`, enforced against the excerpt it cites
(D-030), and that index was being validated in code and then thrown away. The
citation is now a chip beside the attribution that links to `#source-N`, so a
reader can follow the claim to its source — the thing the whole verbatim gate
exists to make trustworthy.

- Numbers come from a CSS counter, so the list cannot disagree with itself
  about the order.
- **Only videos get an image.** A favicon beside the domain is enough for an
  article, and a column of near-identical og-images reads as noise.
- The domain is shown, because "theguardian.com" tells a reader more about
  whether to trust a claim than a headline does.

> **This is a deliberate deviation from PRD §3.5**, which specifies "a
> horizontal, swipeable gallery". The gallery suits a wide surface; the drawer
> is a narrow column on both desktop and mobile. Flagged rather than silently
> reinterpreted.

> **Both scroll containers now set `overflow-x: clip`.** A reading column has
> one scroll axis. `clip` rather than `hidden` so it cannot itself become a
> scroll container, and so nothing added later can quietly widen it the way the
> bleeding gallery did.

### D-042 — CI runs the same command a person does
**Decided 2026-08-22.** Resolves OD-025. A GitHub Actions workflow on every
push to `main` and every pull request, running **`bun run verify`** — one
script, which is also what to run locally.

CI deliberately does not spell out its own sequence of steps. The moment the
workflow's list and the developer's habit differ they drift, and a green tick
stops meaning "this would pass on my machine". `verify` is
`typecheck && check && test && build`, and both read it from `package.json`.

**No secrets are configured, and none are needed.** Every integration in
`src/server/env.ts` is optional by design (D-014), so the app builds and its
tests pass with no keys at all — verified by hiding `.env` and running the
full command. That is the same property that keeps the repo cloneable and
reviewable without handing anyone credentials; CI is just the first consumer
to depend on it.

`--frozen-lockfile` so a dependency cannot resolve differently in CI than in
the version that was reviewed. Concurrency is grouped by ref with
`cancel-in-progress`, because nobody needs the answer to a superseded push.

### D-041 — A dead end still looks like the product
**Decided 2026-08-22.** Resolves OD-022. `errorComponent` on the root route
and on the track route, plus a shared `RouteMessage` shell.

No route had an error boundary. LRCLIB or Genius being unreachable is a normal
Tuesday rather than an exception, and until now it fell through to the
framework's default — a stack trace on an unstyled page. For a product whose
entire premise is considered typography, that is the worst possible thing to
show a reader.

`RouteMessage` is one component rather than the three near-copies that had
accumulated across the two not-found screens. It mirrors the track hero —
kicker, display headline, lead, one way onward — because a reader who lands
here has still landed somewhere.

**Retry first.** `reset()` alone clears the boundary and immediately re-throws
the cached failure; it is paired with `router.invalidate()` so the loaders
actually re-run. The overwhelmingly likely cause is one request that failed
once.

> **The error message is rendered only under `import.meta.env.DEV`.** A reader
> gains nothing from it, and a thrown error can carry a request URL or a
> fragment of a key. Verified stripped from the production bundle, not merely
> assumed to be.

Verified by simulating LRCLIB being unreachable: the route returns 500 with
the styled screen, the retry, and the cause shown in development only.

### D-040 — The docked bar is a player, not a form
**Decided 2026-08-22.** Asked: a seekbar running left to right, and a play/pause
icon rather than a button — "a proper music player vibe".

**The scrub track is a real `<input type="range">`.** A styled `div` with
pointer handlers would need drag, keyboard, focus and screen-reader behaviour
rebuilt, and the rebuild is always worse than the platform's. It spans the full
width, pinned to the top edge of the docked bar. The filled portion is painted
into the track's own background from a `--progress` custom property, so there
is no second element to keep in sync with the value.

The thumb is hidden until hover, focus or drag. A permanent dot on a hairline
reads as an ornament, and the fill already says where the song is.

> **The input is not centred on the top edge.** Half of a 14px invisible input
> hanging above a bar pinned to the viewport floor would swallow clicks meant
> for the lyrics behind it. It sits *inside* the bar, sized to the bar's own
> top padding, where the only thing it overlaps is the record — which is not
> interactive.

**Play/pause is a drawn mark.** "Play" set in the UI face read as a form
control that had wandered into a music player. The triangle is nudged half a
point right: a triangle centred on its bounding box reads as sitting left of
centre inside a circle.

**Elapsed and total** flank the title in tabular figures, so the layout does
not twitch every second as digit widths change. They are `aria-hidden` — the
range input already announces position through `aria-valuetext`, and a screen
reader should not hear the time twice. They are the first thing to go below
`sm`, where the track already shows the position and the title matters more.

`formatTime` is tested against `NaN` and `Infinity`: the player reports `0`
until it is ready and can report `NaN` between states, which is the difference
between a clock and "NaN:aN" sitting in the bar.

### D-039 — Suppress the player's UI, never the player
**Decided 2026-08-22.** Asked: hide the YouTube UI with CSS `display` or
`visibility`, or switch to a YouTube Music API. Neither is available; a third
route gets the same result.

**CSS hiding is the violation, not a way around it.** III.I.9 forbids *"a
player that is not displayed in the page, tab, or screen that the user is
viewing."* `display: none`, `visibility: hidden`, `opacity: 0`, a zero size and
covering the element are all forms of not being displayed. Changing the
technique does not change what it is.

**YouTube Music has no official API.** Every option is an unofficial library
that, in its own words, *"emulates YouTube Music web client requests using the
user's cookie data for authentication"*. Decisively, `ytmusicapi` **"does not
support audio playback or streaming — it's purely for interacting with YouTube
Music's data and account management."** It could not replace the IFrame player
even if the terms were acceptable, and they are not.

**What does work: the player's own parameters.** Suppressing the player's *UI*
is not the same as suppressing the *player*, and the first is sanctioned:

| Parameter | Effect |
|---|---|
| `controls: 0` | Removes the control bar, the title overlay and the large red centre play button that competed with our own Play control |
| `iv_load_policy: 3` | Hides annotations |
| `rel: 0` | Limits end-of-video suggestions to the same channel |
| `playsinline: 1` | Inline playback on iOS rather than forced fullscreen |

What remains is the video image, still displayed — which is what III.I.9 asks
for. The bar now reads as a music player without any of the chrome that made
it look like an embedded video.

> **`modestbranding: 1` was being passed and doing nothing.** Deprecated on
> 15 August 2023 and documented as having no effect. It survived because the
> ambient type was `options: Record<string, unknown>`, which accepts any key.
> `PlayerOptions` and `PlayerVars` are now spelled out, so the next dead
> parameter fails the build rather than sitting there.

> **`disablekb` is deliberately left at its default.** Keyboard control of a
> focused player is an accessibility feature, not chrome.

### D-038 — The player opens in the hero, then docks full width
**Decided 2026-08-22.** Asked: place the player in the hero on first load, and
let it become a mini player once the reader scrolls — full-width and sticky
across the bottom, as Genius does, rather than a pill in the corner.

**One instance, two modes.** The bar is rendered inside the hero and stays
mounted throughout; docking is a class change, never a remount. A remount
would tear down the YouTube IFrame player and restart playback, which is the
whole reason it is not portalled or rendered twice.

- **In the hero** — a compact glass pill sized to its contents, sitting under
  the artist line as part of the composition.
- **Docked** — `position: fixed`, spanning the viewport at `bottom: 0`, square
  cornered. Contents centre inside `--dock-measure` (72rem) so a wide display
  does not strand the record at one edge and the player at the other.

> **The threshold is read from a sentinel, never from the bar.** A bar that
> goes `fixed` the moment it leaves the viewport is instantly back inside it,
> which un-docks it, which takes it out again — a flip-flop at exactly the
> scroll position where it switches. The sentinel is a zero-width element that
> stretches to the slot's height and stays in flow, so nothing the bar does can
> feed back into the decision.

> **The slot keeps its height when the bar leaves it.** Otherwise docking
> collapses the hero and yanks the page upward under a reader mid-scroll.

> **`.hero` now carries `--layer-dock`.** It sets `isolation: isolate` to
> contain the art's negative z-indexes, and that traps a `position: fixed`
> descendant in the hero's stacking context — the docked bar would have painted
> under the canvas that follows it. Naming the layer on the hero lifts both.
> The hero and the canvas never overlap, so nothing else moves.

**Consequences elsewhere.** The dock tokens lose their `md` override: the bar
is full width at every breakpoint now, so `--dock-reach` is one value.
`--discover-bottom` keys off `:has(.playback[data-docked])` rather than
`:has(.playback)` — while the bar is still up in the hero the corner is free.
With the drawer open on `lg`, the docked bar ends at the panel's edge via
`inset-inline` instead of sliding sideways out from under it.

**Also fixed: "Radiohead · Radiohead - Creep".** `meaningfulAlbum` rejected
only whole-string matches against the artist or the title. LRCLIB's entry has
`trackName: "Radiohead - Creep"` and `albumName: "Creep"`; once the title is
normalised the album is an exact echo of it, and the joined form appears on
other uploads. It now folds punctuation and spacing and rejects the artist,
the title, and the two joined in either order.

> Bracketed suffixes are deliberately **not** stripped. "(Redux)" and
> "(Remastered)" name which recording this is, and hiding a real album is a
> worse failure than showing a mildly redundant one.

### D-037 — The hero is sized to the title, not just the viewport
**Fixed 2026-08-22.** Reported: "look at the space the title is taking, that's
way too big."

`--text-hero` is `clamp(3.25rem, 13vw, 11rem)`, which asks only how wide the
*viewport* is. Every title therefore rendered at the same 176px cap, so
"Creep" was a poster and "Phir Le Aya Dil" was two lines eating a third of the
screen. "Main Pal Do Pal Ka Shayar" took three.

The heading is now fitted to its own string: `100cqw / --title-em`, where
`--title-em` is the title's width in em units. That value is **measured, not
assumed** — it comes from `measureEm`, over the same Rufina and Vesper Libre
advance table Satori renders cards from. Guessing an average advance is the
mistake that orphaned words on the first lyric cards; Rufina's widths vary
enough that equal character counts differ by 8%.

| Title | em | Before | After | Lines |
|---|---|---|---|---|
| Creep | 2.80 | 176px | 176px | 1 → 1 |
| Phir Le Aya Dil | 6.87 | 176px | 149px | 2 → 1 |
| Wish You Were Here | 9.78 | 176px | 105px | 2 → 1 |
| Main Pal Do Pal Ka Shayar | 12.14 | 176px | 84px | 3 → 1 |

`min()` keeps the existing cap, so short titles are untouched. A 2.5rem floor
means a very long title stops shrinking and wraps — wrapping is the graceful
failure, unreadable type is not.

> **`container-type` sits on a wrapper, not the heading.** An element cannot
> query its own width, so `100cqw` inside the `h1` would resolve against some
> ancestor. This is the same class of mistake as sizing the card preview in
> percentages, where `font-size` resolved against the parent font size rather
> than the container (D-018).

**Also fixed: "Arijit Singh · Arijit Singh".** LRCLIB uploads routinely set
`albumName` to the artist or the track name. Normalised at the client boundary
in `meaningfulAlbum` rather than guarded in the hero, so every consumer —
cards, meta tags, anything added later — gets it once. An album that only
repeats what is already on screen carries nothing (OD-016).

### D-036 — The record leads; the player stays visible
**Decided 2026-08-22.** Asked: drop the YouTube preview from the playback bar
and use the album image instead — circular, spinning while playing, still when
paused.

The complaint was fair. The bar showed a raw YouTube poster frame: low
resolution, the video's own title text baked into the image, and a large red
play button competing with the actual Play control beside it.

But removing the player is the one thing the policy names. Checked against the
current text rather than the D-022 notes:

| Section | Wording |
|---|---|
| III.I.9 | *"a player that is not displayed in the page, tab, or screen that the user is viewing"* |
| III.I.7 | *"separate, isolate, or modify the audio or video components"* |
| — | **No minimum size or visibility requirement is specified anywhere.** |

That last line is the opening D-022 never explored. The policy requires the
player to be *displayed*; it does not require it to be prominent. So the
requested design is reachable without the exposure:

- **Album art becomes the lead element** — a circular record at full dock
  height, spinning on an 8s linear loop while playing.
- **Pausing pauses the animation rather than resetting it**, so the disc holds
  the angle it stopped at and play/pause reads as one continuous object rather
  than two states.
- **The player shrinks to roughly two thirds height** and moves to the trailing
  edge. Genuinely on screen: never clipped, faded, covered or sized to nothing.

> **Do not "tidy away" `.playback__video`.** Its size is a deliberate minimum,
> not leftover styling. Hiding it — including with `opacity: 0`, a zero size,
> or by covering it — is the III.I.9 violation this decision exists to avoid.
> The rejected alternatives were "art only" and "reveal the player on tap";
> both leave the player undisplayed *during playback*, which is exactly when
> the clause bites.

**Second line of the meta block now carries the artist.** It read "PAUSED",
which duplicated the Play button immediately beside it, and "Following", which
restated what the visibly-following canvas already showed. Notices are kept
only for states the reader cannot otherwise see — Loading, No timings, Manual
scroll — and those keep the uppercase label voice, tinted with the track
accent. An artist name is not a label, so it sets in sentence case.

### D-035 — Focus and touch are platform rules, not component choices
**Decided 2026-08-22.** A single `:focus-visible` rule in `@layer base`, and a
`tap-target` mixin for controls whose padding cannot grow.

Six of seven interactive controls defined no focus style at all. Each fell back
to the browser default outline, which on a dark glassmorphic surface is close
to invisible. Written per component this recurs forever — every new control is
another chance to forget — so it is written once as an **opt-out**, wrapped in
`:where()` so specificity stays at zero and any component that wants a
different ring simply writes one and wins.

Touch targets are held to 44px. WCAG 2.5.8 requires only 24px, which is too
mean for a playback bar tapped one-handed while reading; Resync measured 32px
and play/pause 40px. Both grow via a centred transparent `::after` rather than
padding, because the dock's height is declared (D-033) and growing a child
would falsify it.

### D-034 — Bottom-edge surfaces respect the safe area
**Decided 2026-08-22.** Nothing in the codebase used `env(safe-area-inset-*)`.
The playback bar and the mobile insights sheet both anchor to `bottom: 0`, so
on any iPhone with a home indicator they sat underneath it. `--dock-safe`
carries the inset and is folded into `--dock-reach`, so every offset computed
from the dock inherits it rather than each site remembering.

### D-033 — Floating elements share a dock and a layer scale
**Fixed 2026-08-22.** Reported with a screenshot: the "Preparing the story"
pill sitting on top of the playback bar, covering the pause control.

Three faults, one cause. `.discover` and `.playback` both hard-coded
`right: 1.5rem; bottom: 1.5rem` in separate files, with z-indexes of 40 and 35
chosen independently — six ad-hoc values across five files, no scale, nothing
declaring what stacks above what. Neither file knew the other existed.

Worse was the second instance, which the screenshot did not show. Opening the
drawer on desktop compresses the canvas with `padding-right`, and **padding
does not move `position: fixed` children**. The 30rem panel therefore opened on
top of the playback bar *and* on top of the button that closes the drawer.
Escape still worked; nothing visible did.

The fix is structural rather than cosmetic:

- **A named layer scale** in `styles.css`. Roles, not numbers. Nothing writes a
  bare `z-index`.
- **One dock.** The bar and the button share `--layer-dock` and stack by
  offset, because they are queued rather than competing.
- **The bar's height is declared and its contents sized to fit**, inverting the
  old dependency. `--dock-reach` is therefore true by construction, and the
  button above can offset by it without measuring — which matters because there
  is no browser in this environment to measure with.
- **The dock translates with the canvas** when the drawer opens, by the same
  `--drawer-width` the padding uses, so the three can never disagree.
- **On mobile the bar rides above the sheet** rather than being buried by it.
  The player must stay visible (D-022), and pausing should not require closing
  the story first.

> **Cascade:** where the button sits is resolved as one inherited custom
> property, not as competing descendant rules. `.track-shell:has(.playback)
> .discover` and `.track-shell[data-drawer="open"] .discover` **both score
> (0,3,0)**, so source order silently decided which won — and the first draft
> of this fix got it backwards, burying the button under the sheet. Nested
> custom properties make each case plainly out-specify the one above it.

> **Do not nest overlays in the dock.** `position: fixed` creates a stacking
> context, so a drawer rendered inside the dock could never rise above it. They
> stay siblings.

### D-032 — Every step advances on tap
**Decided 2026-08-22.** Reported: "after step 1, I need to click Continue. Let's
not make the user click buttons again and again while selecting preferences."

Mood was multi-select (D-027), which made it the only step that could not
advance on tap — a multi-select has no natural commit signal, so it needed a
Continue button. Pull and familiarity advanced on tap and made that button look
like exactly what it was: an extra click in the middle of a three-question flow
whose whole purpose is to be lighter than a blank search bar.

Three ways out were weighed. Reordering so mood came last would have turned the
button into the terminal "Show me", the one click a reader wants — but it costs
mood as the opening question, which is the most evocative of the three.
Auto-advancing on a timer keeps multi-select but there is no Back in this flow,
so an early advance is unrecoverable, and timed advance is a WCAG 2.2.1 concern.

**Mood is now single-select.** All three steps behave identically: three taps,
no buttons. `Preferences.moods: Mood[]` becomes `mood: Mood | null`, which is
also the honest type — it now matches pull and familiarity instead of being the
one axis shaped differently.

The cost is real and accepted: a reader who wants longing *and* restless has to
pick one, and mood carries the heaviest scoring weight (3). The widening that
multi-select bought is partly recovered by the diversity pass, which was already
mixing language, era and artist across the shelf.

Stored preferences from before this migrate rather than reset — the first
element of a saved `moods` array becomes `mood`, and the legacy key is
destructured off rather than spread through, so it dies on the next save.

> **Timing:** with the button gone, every step transition became a tap the
> reader waits through. `AnimatePresence mode="wait"` runs exit then entrance in
> sequence, so matching durations meant 0.84s of dead time per tap — the button
> had been absorbing it. Exits now use `transition.dismiss` (0.12s, `ease.exit`),
> giving 0.54s: what is leaving snaps away, what arrives still settles.

### D-031 — Grounding keeps what can actually ground
**Decided 2026-08-22.** `gatherSources` fetches 8 results and discards any whose
excerpt is under 250 characters. `InsightSource.thumbnail`, previously `null`
everywhere and read nowhere, is now populated.

Roughly a third of what Tavily returns for a song is a social-media stub — a
Facebook or Instagram page whose entire excerpt is ~140 characters of title and
boilerplate. Two costs: the model gets nothing to quote from, and the Source
Gallery lists a link that never fed the synthesis, which is a small lie about
provenance. Over-fetching absorbs the loss at no extra cost — still one Tavily
search. Measured across four tracks: 5–8 usable sources kept, 0–3 stubs dropped.

Excluding lyrics and social domains outright was tested and **rejected**. It
looked decisive on the first track sampled, but across three it cost more than
it saved — Genius annotation pages carry real editorial prose, and dropping
them took *Wish You Were Here* from 6 usable sources to 4. Excerpt length is
the honest signal; the domain is not.

For thumbnails, PRD §3.5 asks for "YouTube thumbnails or article headlines". A
video result gets its true still, constructed from the id via `toVideoId`
rather than fetched. An article falls back to the favicon Tavily already
returns — a weaker visual, but free. Both 404 often enough that a failed load
hides the element rather than showing a broken-image glyph.

> **Cache:** the insight key is now `insight:v2:`. Entries live 30 days, so
> without a bump the reader would keep receiving insights built under the old
> rules for a month — quotes that predate the verbatim gate (D-030) and sources
> with no thumbnail. The D-029 note that "every cached entry stays valid" held
> for the paragraph join alone; these two changes altered the stored shape.

> **Quota:** Tavily is on the Researcher plan — 1000 searches/month, and one
> search per uncached track. Since D-050 removed Gemini's 20/day ceiling, this
> is now the binding limit on cold insights.

### D-030 — The quote gate verifies the text, not just the citation
**Decided 2026-08-22.** `validateQuote` now requires the quote to appear in the
excerpt it cites, not merely that `sourceIndex` is in range.

The prompt has always demanded verbatim quotes, and the schema has always
demanded a `sourceIndex`. Neither is enforcement: a model that invents a quote
and points it at source 3 passed every check. The prompt was the only guard on
the highest-stakes property in the product — a fabricated quote attributed to a
real artist is worse than showing no quote at all.

The comparison folds curly quotes, dashes, ellipses, case and whitespace before
matching. Byte-exact was considered and rejected: models routinely retype a
genuine quote with a straight apostrophe, so a strict check would discard real
quotes far more often than fake ones, aiming the gate at punctuation instead of
fabrication. Quotes shorter than 12 folded characters are refused outright —
matching "the" against an excerpt is not evidence of grounding.

Verified by mutation: removing the check fails 2 tests, removing apostrophe
folding fails 1, removing the length floor fails 1.

### D-029 — Synthesis paragraphs are structural, not typographic
**Decided 2026-08-22.** The model returns `synthesis` as an array of
paragraphs, joined with blank lines at the provider boundary.

> **Amended by D-050.** The join moved to `providers/insight.ts`, shared by both
> providers. It also had to become defensive: DeepSeek cannot enforce the array,
> so a bare string is split rather than assumed. The reason for the array is
> unchanged and was re-confirmed on the new provider — without the shape stated,
> `synthesis` came back as an array 0 times out of 8.

Asked for "two or three short paragraphs" as a single string, the model returned
one unbroken block in 4 of 6 sampled tracks — up to 1467 characters with no
blank line in it. The drawer splits on `/\n{2,}/`, so it had nothing to split
and rendered a wall of text in the Synthesis slot, which is the drawer's
marquee. Making paragraphs a schema constraint rather than a prompt request
fixed 6 of 6 in testing, the same reasoning that put `sourceIndex` in the schema.

The join happens at the model boundary rather than carrying `string[]` through
`Insight`. The wire shape, every cached entry, and `insights-content.tsx` are
therefore untouched — the component already split on blank lines, it simply
never had any to split.

> **Model:** `GEMINI_MODEL` defaults to `gemini-3.5-flash`. `gemini-2.5-flash`
> was retired for new API keys mid-2026 and returns 404 with a pointer to a
> successor; the default was moved rather than pinned, and the variable stays
> overridable. `gemini-3.6-flash` also works but averaged 11.9s against 6.5s,
> outside the PRD §4 budget of 3–6s. The Pro tier returns 429 on a free key.
>
> Since D-050 the primary is `DEEPSEEK_MODEL`, defaulting to
> `deepseek-v4-flash`. `deepseek-v4-pro` was measured and rejected: 54.2s median
> against 19.4s, with no gain on any gate. Both variables stay overridable for
> the same reason — model names churn, and being unable to change one without a
> deploy is how the 2.5-flash retirement took the drawer down.

> **Quota:** the free tier allows **20 generate-content requests per day**. The
> 30-day cache absorbs repeat views, so this is workable in development, but it
> is a **launch blocker**: 20 uncached tracks per day across all users, then the
> drawer 502s. Resolve before deploy — either billing, or pre-warming the
> curated catalogue into the cache. Tracked as OD-021.
>
> **Resolved by D-050** — a metered provider, not a pre-warm.

### D-028 — Landing page sized for a doorway, not a poster
**Fixed 2026-08-22.** Reported: "huge fonts, the user has to scroll first then
answer the question."

The landing centred itself in a full-height flex column with the hero at the
full `--text-display` scale (up to 5.5rem). On a laptop that pushed the first
question below the fold — so the reader had to scroll before they could answer,
which is precisely the friction the stepper exists to remove.

The page now starts near the top, the hero caps at `clamp(2rem, 4.5vw, 3rem)`,
and the stepper's internal spacing is tightened. Budget above the fold is
roughly 540px, comfortable even on a 700px viewport.

The **track page keeps the full display scale** — that is where a hero belongs.
This is a landing-specific size, not a change to the type system.

### D-027 — Preferences describe the reader, not the record
> **Superseded in part by D-032:** mood is no longer multi-select.

**Revised 2026-08-22.** Replaces the mood/language/era stepper.

Language and era were **binary partitions**: each step halved the pool, so
three questions cut 45 tracks to roughly six, and a reader who enjoys both
English and Hindi was forced to pick a side. They described the *record*.

The axes now describe the *reader*:

| Axis | Weight | Why |
|---|---|---|
| **Mood** (multi-select) | 3 | What they came in feeling. Multi-select so two answers **widen** the shelf. |
| **Pull** — story / craft / honesty / imagery | 2 | What they value in writing. The most on-brand axis for a typographic lyrics product. |
| **Familiarity** — canon / deep / surprise | 1.5 | Where ownership lands: "show me things I don't know." |

**Language and era are still recorded but never scored.** They now drive a
diversity pass instead: each already-picked language, era and artist penalises
the next candidate, so the shelf mixes on its own without the reader choosing a
side. Artist repetition is penalised hardest — the same name twice in three
picks reads as a bug.

"Surprise me" is a real answer meaning *no preference*, and scores nothing —
distinct from an unanswered step, though they rank the same.

**Two shelves, not three picks.** Discovery is no longer capped: the headline
Deep Dives (3) sit above a longer "People also like" (12), drawn from what the
first shelf did not take, preference-weighted but shuffled so it reads as a
wander rather than positions 4–15 of the same ranking.

Catalogue grew to **56 verified tracks** to support the new axes — all 16
mood×pull cells covered, deep cuts raised to 41% so "deep" has somewhere to go,
and English/Hindi balanced 27/29. All 56 verified live against `/api/track`.

### D-026 — Deep Dives: ask, then curate
**Decided 2026-08-22.** Resolves OD-013 and completes PRD §3.1.

§3.1 asks for "3 trending songs", but **neither source can supply trending**:
Genius `/charts` returns 403 (`Action forbidden for current scope`) for a
client access token, and LRCLIB has no such endpoint at all.

Rather than fake it, the page now asks. A three-step stepper — mood, language,
era — seeds a hand-curated catalogue. This addresses §3.1's *stated* problem
more directly than three fixed picks ever could: "a blank search bar is
intimidating; users don't always know what they want to search for."

**"Gamified but soothing"** was read as *tactile, never game mechanics*: no
points, badges or streaks. One question per screen, generous type, a press
that gives 1.5% under the finger, and progress shown as three small marks
rather than a filling bar — a bar measures what is left, which is the anxious
framing. Every step is skippable, and skipping is a real answer: an unanswered
axis simply carries no weight.

Preferences live in `localStorage`. No account, nothing transmitted. They are
read in an effect, not in the state initialiser, because localStorage does not
exist during SSR and reading it on first client render would trip a hydration
mismatch — hence the SSR placeholder, which also stops the stepper flashing at
a returning reader.

**Ranking gives partial credit rather than filtering.** Mood scores 3, language
2, era 1. Someone answering "defiant / hindi / classic" still gets a full shelf
if that cell is thin, instead of an empty one. Picks rotate daily from a
date-seeded shuffle — deterministic, so every visitor sees the same three on a
given day, with no cron and no stored state.

**Every entry is verified.** All 45 tracks were checked to exist in LRCLIB with
synced lyrics before being committed; candidates that did not resolve were
dropped, not shipped. All 16 mood×language×era cells are covered, and a test
enforces that. A recommendation leading to a dead page is worse than one fewer
recommendation.

To extend the catalogue: add entries, confirm each resolves in LRCLIB with
synced lyrics, and check the cell-coverage test still passes.

### D-025 — Auto-scroll follows the line, not the stanza
**Fixed 2026-08-22.** Reported as "auto sync is not working correctly".

Two distinct faults, both real:

1. **Undelimited files never scrolled at all.** Many LRCLIB uploads carry no
   blank lines, so `toStanzas` produced a single stanza. "Choo Lo" arrived as
   38 lines in one 187-second block: one scroll target, so the page moved once
   and then never again, and the §3.3 focus effect had nothing to contrast.
2. **Stanza-level sync lurched even on good files.** Stanzas run 30–71
   seconds, so Bohemian Rhapsody scrolled 8 times across 354 seconds. That is
   not "perfectly in sync" (PRD §3.2); it is a jump every minute.

| Track | Stanzas before | after | Longest stanza |
|---|---|---|---|
| Choo Lo | **1** | 7 | 187s → 32s |
| Bohemian Rhapsody | 8 | 8 | 71s (unchanged) |
| Karma Police | 7 | 7 | 38s (unchanged) |

**Fix 1 — sync at line level.** `linePositionAt` resolves the exact line, and
the canvas scrolls to that element. Choo Lo goes from 1 scroll target to 38.
Opacity stays stanza-level: that is PRD §3.3's focus effect, a different
concern from keeping pace with audio. The sung line takes the track accent —
understated, since the stanza fade already carries the focus.

**Fix 2 — recover sections from timing.** When a file averages more than 8
sung lines per stanza it plainly is not delimited, so stanzas are re-split on
gaps over 5 seconds — a pause that long is an instrumental bar or a breath
before the next verse. Applied **only** as a fallback: files that delimit
themselves are left alone, because splitting those on timing would cut across
the writer's own sections. Verified against four tracks; only the undelimited
one changed.

### D-024 — Cache: Upstash Redis, degrading to memory
**Decided 2026-08-22.** Resolves OD-001.

HTTP-based rather than a TCP client, so it runs on Node, Bun, Vercel and
Workers alike — which is what lets D-009 keep the deployment target open.

Every Redis failure degrades to a **miss**, never an error. A cache that can
take the page down is worse than no cache: lyrics are always re-fetchable from
LRCLIB, so the correct response to an outage is to be slow, not broken.

Without credentials the app still runs on the in-memory adapter and **logs a
warning at startup** saying plainly that it is per-process, does not survive a
restart, and is unsuitable for production. The previous silence there was the
real risk — it would have deployed looking fine.

Keys are namespaced `tle:` so a shared instance cannot collide.

### D-023 — Tests for the heuristics, verified by mutation
**Decided 2026-08-22.** Vitest, scoped to pure logic.

Everything in this build was verified by hand, once, at the moment it was
written. None of that persisted, and several of the bugs found were subtle
enough to reappear unnoticed. The suite covers the four places where a wrong
answer is plausible rather than obvious:

| Area | What it pins |
|---|---|
| `lrc.ts` | multi-stamp lines, metadata tags, stanza boundaries, and the end-time extension that stops auto-scroll advancing early |
| `lrclib.ts` | the `"A - B"` normalisation, including its **known** mis-split, pinned so it cannot change silently |
| `card.ts` | that type never overflows either axis across Latin, Devanagari, mixed script and pathological input |
| `genius.server.ts` | both sides of the match threshold, including the Genius translation entry that must be rejected |

**Mutation-tested.** A green suite proves nothing on its own, so four fixed
bugs were deliberately reintroduced to confirm the tests fail:

| Reintroduced bug | Result |
|---|---|
| stanza end-time no longer extended | 1 failed |
| hex → oklch (Satori's black card) | 1 failed |
| match threshold loosened to 0.05 | 3 failed |
| split on first separator, not last | 1 failed |

Resolves OD-010. Not covered: components, network clients, and the Satori
render itself — those need a browser or a live service, and are better served
by the manual verification recorded in the commit log.

### D-022 — Playback: YouTube, with a visible player
**Decided 2026-08-22.** Resolves OD-002. **Both options named in PRD §2 are unusable.**

Checked against the providers' own documentation, not from memory:

| Option | Finding |
|---|---|
| Spotify Web Playback SDK | Premium required — and *"mobile only types of premium subscriptions are excluded"* |
| Spotify `preview_url` | **Deprecated**, and *"Audio Preview Clips may not be offered as a standalone service or product"* — which is exactly what we would be doing |
| YouTube **audio-only** | **Explicitly prohibited** |

YouTube's developer policies forbid *"a background player, meaning a player
that is not displayed in the page, tab, or screen that the user is viewing"*
and separately forbid developers to *"separate, isolate, or modify the audio or
video components"*. The PRD's "YouTube IFrame API audio-only" is not a grey
area — it is the thing the policy names. It was not implemented.

**What we do instead:** a visible player, docked as a compact now-playing bar.
Free, no login, works for every listener, and exposes `currentTime` for sync.
The cost is a persistent video element on a typographic page, so it is composed
into the design rather than hidden.

**Finding the video costs nothing extra.** Genius already stores the YouTube
URL for a song under `media`, so playback reuses the Genius lookup we already
cache for 30 days. The YouTube Data API was avoided deliberately: its search
costs 100 quota units a call, roughly 100 tracks a day on the default
allowance.

**Auto-scroll.** The playback clock is polled at 250ms — the IFrame API pushes
state changes but not position — and mapped to a stanza through
`stanzaIndexAt`. Sync yields the moment the reader scrolls for themselves, and
a "Resync" control brings it back (PRD §3.2).

Manual override listens for `wheel`, `touchmove` and the scrolling keys rather
than the `scroll` event: programmatic scrolling fires `scroll` too, so we would
have spent our time cancelling ourselves.

### D-021 — Insights: no source, no quote
**Decided 2026-08-22.** An LLM via REST (OD-003); Tavily for grounding
(OD-004). The provider was Gemini; it is DeepSeek since D-050, and the gate
below is provider-independent by construction.

PRD §3.5 asks for "a highlighted pull-quote from the artist or producer", and
the product promises context "directly from the original creators". An LLM
asked what a song means will readily invent a plausible quote and attribute it
to a named, living person. That is not a weaker feature — it is a fabrication
about a real individual.

So the quote is gated three times over:

1. The prompt forbids invention in absolute terms and states that returning
   null is the correct answer.
2. The response schema requires a `sourceIndex` alongside every quote.
3. **`validateQuote` discards any quote whose `sourceIndex` does not point at a
   real gathered source.** Prompts are guidance; this is enforcement.

With no `TAVILY_API_KEY` there are no sources, therefore no quote — ever. The
drawer says so plainly rather than quietly dropping the slot.

**Typography.** The quote is set in Elms Sans *italic*, not Rufina. Rufina
ships no italic and synthesising one shears the letterforms at that size
(D-005). The serif→sans shift also marks the quote as a different voice from
the song, which it is. Resolves OD-006.

**Progressive by default.** Generation starts on mount, not on click: PRD §4
puts the 3–6s behind the reader rather than in front of them. The button
shimmers while the model works and illuminates when ready.

**Two behaviours, not one restyled.** Desktop compresses the canvas with a
side panel so the reader keeps their place; mobile is a sheet over the lower
half with the lyrics still visible (PRD §3.5). Only the sheet's grip is a drag
surface — `dragListener={false}` plus explicit `dragControls` — otherwise the
body could not scroll.

**REST, not the SDK.** One fewer dependency, and it keeps D-009's
runtime-agnostic constraint. `GEMINI_MODEL` is configurable because model names
churn; a 404 logs that specifically.

### D-020 — Card type fills the measure
**Decided 2026-08-22.** Width leads; line count no longer sets the size.

Devanagari advances are narrower than Latin, so a line-count rule capped those
cards at 56px filling barely half the measure — 427px of 872 — while a Latin
card at the same line count filled 840px. Devanagari read smaller and emptier
for no reason a reader could perceive as intentional.

Type now grows until it fills the measure, bounded by three constraints:

| Bound | Value | Why |
|---|---|---|
| Width | `872 × 0.97 / widest line` | the measure, with kerning headroom |
| Height | `780 / (lines × 1.42)` | a six-line verse must not run off the card |
| Ceiling | 108px | a two-word selection is not a billboard |
| Floor | 30px | below this it stops reading as display |

The height bound uses the loosest leading we ever apply, so it always holds.
The trade-off accepted: a card's type size now depends on its content, so two
selections from the same song can be set differently. Filling the measure was
judged the better read.

Devanagari moved 56px → 108px, filling 823/872.

### D-019 — Devanagari: Vesper Libre alongside Rufina
**Decided 2026-08-22.**

Rufina has **no Devanagari coverage whatsoever** — every such codepoint maps to
`.notdef`, so Hindi lyrics exported as a card of tofu boxes. OD-017 had called
this "sizes imprecisely", which badly understated it.

Vesper Libre (transitional Devanagari serif) is the companion face. Transitional
sits closer to Rufina's contrast than a humanist face would, so Devanagari and
Latin cards read as the same product.

**No script detection is needed.** Satori falls back per glyph across the fonts
supplied to it, so `fontFamily: "Rufina, Vesper Libre"` handles a line like
`दिल में hope है still` correctly — verified. The web font stack mirrors that
order for the same reason.

The reading view was also silently substituting a **system** Devanagari face,
so the page and the exported card did not match each other. `styles.css` now
loads Vesper Libre explicitly.

Card metrics cover both faces. Combining marks (nuqta, some matras) carry a
real advance of 0 and contribute nothing, which is correct. Conjunct ligatures
render narrower than the sum of their parts, so the table slightly
over-estimates Devanagari — erring toward type a little small rather than type
that overflows.

### D-018 — Lyric Card typography: measured, not estimated
**Decided 2026-08-22.** `satori` + `@resvg/resvg-js`, 1080² PNG.

Three failures found by *looking at the output*, each of which produced a
successful build:

1. **Satori ignores `\n`.** Passing a multi-line string reflowed the lyric into
   continuous prose. Lyric line breaks are semantic — the line structure *is*
   the writing — so every line is now its own element.
2. **Satori has no OKLCH support.** It rendered `oklch()` as black, silently,
   producing an entirely black card. All card colours are now converted to sRGB
   hex at the boundary. We still author in OKLCH, because perceptual lightness
   is what keeps treatments legible across every hue.
3. **Estimated glyph widths were wrong.** Sizing type by line count alone
   overflowed the card and orphaned a word onto a fourth line. An assumed
   0.46em average was the second wrong answer; Rufina's true mean is 0.535em.

Type is now sized from Rufina's **real advance widths**, extracted into
`src/lib/card-metrics.ts` by `scripts/generate-card-metrics.ts`. The table is
embedded rather than parsed at runtime so the browser preview and the server
render use identical maths — the preview cannot drift from the exported file.
A 3% fit margin absorbs Satori's kerning, which our plain-advance sum does not
model.

The preview sizes type in **`cqw`** units against a `container-type: inline-size`
box. A percentage `font-size` would have resolved against the parent font size
rather than the container width, and the preview would not have matched.

**Selection snaps to whole lines.** The reader drags across characters, but a
card is built from lines, so we collect every line *element* the range touches
and take those lines whole. Long-press produces a native selection too, so
touch needs no separate path.

**Fonts:** Satori accepts TTF/OTF/WOFF but **not woff2**. Rufina ships `.woff`;
`@fontsource-variable/elms-sans` is woff2-only, so the non-variable
`@fontsource/elms-sans` was added for its `.woff` build.

### D-017 — Progressive loading: lyrics first, visuals streamed
**Decided 2026-08-22.**

Bundling artwork into the track response put the cold page at ~1.6s against
PRD §5's sub-500ms target, and bundling thumbnails into search cost ~2s on
every novel query — the opposite of "instant" (§3.1). Lyrics and visuals are
now separate operations:

| Operation | Path | Cold |
|---|---|---|
| `getTrack` | LRCLIB only | ~0.23s |
| `getTrackVisuals` | Genius + image fetch + decode | ~0.8s |

The track loader awaits the lyrics and returns the visuals promise unawaited,
rendered through `<Await>`. Verified at the socket: first chunk carries the
readable lyrics at **0.231s**, a second chunk delivers artwork and palette at
~1.0s, `Transfer-Encoding: chunked`.

This is the same two-speed pattern PRD §4 already prescribes for AI insights,
applied one layer earlier.

**Measurement note.** `curl`'s `time_starttransfer` reports completion here,
not first byte, and initially made the streaming look broken. Only a raw socket
read timing individual chunks showed the truth. `defer()` is used because it is
the documented API and adds proper deferred-error serialisation — but it was
*not* what fixed the latency; streaming already worked without it.

**Palette application.** The palette arrives after first paint, so it is applied
via a scoped `<style>` rule rather than an inline `style` prop — re-rendering
the article to add one would remount the lyric canvas and lose the reader's
scroll position. Values are regex-validated against culori's exact oklch output
before injection.

**Thumbnails** are fetched per row against `/api/artwork` and deduped by
TanStack Query on artist+title, so the same recording resolves once across
every search that surfaces it.

### D-016 — Palette extraction: server-side, cached with the track
**Decided 2026-08-21.** `node-vibrant` + `culori`, both pure JS (no native
binaries, so D-009's runtime-agnostic constraint holds).

`images.genius.com` sends `access-control-allow-origin: *`, so client-side
canvas extraction was genuinely available. Server-side won on three counts:

1. **No flash.** The palette ships inside the 30-day cached track, so the very
   first paint is already themed. Client-side extraction paints the default
   accent, then repaints once the image decodes — mid-hero-animation.
2. **Paid once.** Extraction is ~57ms on a cold track, then never again.
   Client-side repeats the work for every visitor.
3. **Satori has no browser.** Lyric Cards and OG images (D-010) render
   server-side. Client extraction would need a second implementation.

Extraction runs on the ~300px thumbnail, not the full image: enough pixels for
colour, a fraction of the bytes.

**Readability normalisation.** A raw swatch cannot be trusted as an accent.
Album art routinely yields near-black swatches that would be invisible on the
`oklch(0.13)` canvas, or neon ones that vibrate against it. So we keep the
artwork's *hue* — the part that reads as "this track's colour" — and clamp
lightness and chroma into a legible band:

| Constant | Value | Role |
|---|---|---|
| `ACCENT_LIGHTNESS` | 0.72 | `--track-accent` |
| `SOFT_LIGHTNESS` | 0.62 | `--track-accent-soft` |
| `GLOW_LIGHTNESS` | 0.78 | `--track-glow` (α 0.35) |
| `MIN_CHROMA` | 0.09 | below this an accent reads as grey |
| `MAX_CHROMA` | 0.19 | above this it reads as neon |
| `ACHROMATIC_CHROMA` | 0.02 | below this the swatch is rejected outright |

That last one fixes a real bug found in testing: a greyscale cover has zero
chroma, so hue defaults to 0, and flooring the chroma invented a dull red that
appears nowhere in the artwork. Achromatic swatches are now skipped, and a
wholly achromatic cover falls back to the default accent.

**These six numbers set the entire product's colour behaviour** and are the
intended tuning surface.

### D-013 — Custom CSS: Sass, referencing tokens rather than `@apply`
**Decided 2026-08-21.** `sass-embedded`. Tailwind entry stays `styles.css`.

Tailwind v4 documents that it is not designed to run alongside a preprocessor —
v4 *is* the CSS pipeline. Three integrations were tested rather than assumed:

| Approach | Outcome |
|---|---|
| `@import "tailwindcss"` inside `.scss` | Sass tries to resolve it as a Sass import and fails. **The entry must stay `.css`.** |
| Sass + `@tailwindcss/vite` | Nesting, `$vars`, math, mixins, `var(--token)` all work. But `@apply` **silently passes through unexpanded** and ships literal `@apply` to the browser. |
| Tailwind via `@tailwindcss/postcss` | `@apply` expands, but the SSR build fails (`postcss-import` resolving `"tailwindcss"` as a path) **and all 14 font assets stop resolving**. Rejected. |

So Sass is adopted for custom CSS, and `@apply` is **not used inside `.scss`**.
The silent-failure mode is the deciding factor: a build that succeeds while
shipping dead CSS is worse than one that errors.

This costs nothing in practice. Design tokens are already CSS custom
properties, so `.scss` reads `var(--text-lyric)` directly — which also survives
runtime palette swapping, something `@apply` could never do.

**Convention:** Tailwind utilities in JSX `className`; `.scss` for structure,
mixins, and states utilities can't express. Partials resolve via Sass
`loadPaths: ["src"]`, so `@use "styles/mixins"` works from any depth.

### D-014 — Server boundary: one service, two exposures
**Decided 2026-08-21.**

TanStack Start's own guidance is explicit: an SSR loader must never `fetch` its
own API route, because loaders are **isomorphic** — they run on client *and*
server — so relative URL resolution is not portable. The same property means
secrets must live inside `createServerFn`, never in a loader.

Business logic therefore lives once in `src/server/*.server.ts` and is exposed
through two boundaries:

| Boundary | File | Caller |
|---|---|---|
| Server function | `src/server/lyrics.functions.ts` | Route loaders (SSR + client nav) |
| HTTP route | `src/routes/api/*.ts` | Browser fetches, external callers (PRD §4) |

### D-015 — LRCLIB metadata normalisation
**Decided 2026-08-21.**

LRCLIB metadata is user-contributed and frequently malformed — the top result
for "bohemian rhapsody" returns `artistName` **and** `trackName` both set to
`"Bohemian Rhapsody - Queen"`. Raw, that renders as a broken autocomplete row.

`src/lib/clients/lrclib.ts` repairs the common shapes: strips an artist that is
redundantly repeated in the title (leading or trailing), and for the degenerate
case where both fields carry the same `"A - B"` string, applies the dominant
user-upload convention **"Title - Artist"** and takes the trailing segment as
the artist.

That last rule is a **heuristic and will be wrong sometimes** — `"Sweet Child O'
Mine - Guns N' Roses"` resolves correctly, but a title that genuinely contains
" - " will not. Revisit if Genius metadata (OD-005) gives us a better authority
to reconcile against.

Results are also deduped (LRCLIB holds many uploads per recording, preferring
synced lyrics then longest duration) and instrumentals are dropped, since they
have nothing to read.

### D-011 — Formatting authority: Biome defaults
**Decided 2026-08-21.** Tabs, double quotes, semicolons.

The scaffolder shipped an internally inconsistent state — its `biome.json` specified
tabs + double quotes while every file it emitted used 2-space + single quotes, so
`biome check` failed on 9 of 9 files at birth. Resolved by letting the configured
formatter be the single authority and reformatting, rather than bending config to
match generated code. Zero real lint errors were involved — all 12 were cosmetic.

Reversible in one line of `biome.json` + `bunx biome check --write .`.

### D-012 — Scaffolder corrections applied
**2026-08-21.** The generated project needed four fixes before it was sound:

| Issue | Fix |
|---|---|
| 8 deps pinned to `"latest"` — not reproducible across fresh installs | Pinned to resolved versions |
| `src/router.tsx` had 3 unused imports, failing its own `noUnusedLocals` | Removed; `TanstackQueryProvider` was an empty no-op |
| `.gitignore` covered `.env` but not `.env.local` / `.env.production` | Broadened to `.env*`, with `!.env.example` |
| `pnpm.onlyBuiltDependencies` key in a bun project | Removed |

### D-010 — Lyric Card export: server-side Satori
**Decided 2026-08-21.** `satori` `0.33` → SVG → rasteriser (per D-009).

Client-side `html2canvas` / `html-to-image` was rejected outright. Those libraries
rasterise the DOM approximately: they drop ligatures, mangle kerning, ignore optical
sizing, and go soft at 2x. Shipping a *typography* product whose flagship shareable
asset has bad typography is not acceptable.

Satori performs real text shaping from the Rufina woff2 — true kerning, crisp at
arbitrary resolution. The same module serves dynamic OG images for link previews,
so one pipeline covers both halves of the virality metric (§5).

---

## 3. Project Structure

Feature-first. Routes stay thin; each feature owns its components, hooks, and motion variants.

```
src/
├── routes/
│   ├── __root.tsx             # shell, head/meta, errorComponent (D-039)
│   ├── index.tsx              # discovery: stepper + search + shelves (§3.1)
│   ├── track.$trackId.tsx     # hero + canvas + drawer (§3.2, §3.3, §3.5)
│   └── api/
│       ├── search.ts          # GET /api/search?q=
│       ├── track.ts           # GET /api/track?id=
│       ├── artwork.ts         # GET /api/artwork?title=&artist=   (per-row art)
│       ├── insights.ts        # GET /api/insights?…               (deferred)
│       ├── card.ts            # POST /api/card                    (PNG, §3.4)
│       └── og.ts              # GET /api/og?trackId=              (social, D-051)
│   ├── robots[.]txt.ts        # GET /robots.txt                   (D-053)
│   └── sitemap[.]xml.ts       # GET /sitemap.xml — curated catalogue only
├── server/                    # server-only; never imported by the client
│   ├── env.ts                 # the only reader of process.env (D-014)
│   ├── lyrics.server.ts       # business logic + cache keys (D-014, D-017)
│   ├── lyrics.functions.ts    # createServerFn boundary for loaders
│   ├── insights.server.ts     # orchestration + provider fallback (D-050)
│   ├── genius.server.ts       # artwork, match scoring, youtube id (D-022)
│   ├── palette.server.ts      # node-vibrant → OKLCH accents (D-016)
│   ├── card.server.tsx        # Satori + resvg rasteriser (§3.4)
│   ├── fonts.server.ts        # which face covers which script (D-057)
│   ├── fonts.test.ts          # asserts every path + every script has a face
│   ├── cache/                 # adapter selection: Upstash or memory (OD-001)
│   └── providers/
│       ├── insight.ts         # prompt + every output gate, shared (D-050)
│       ├── deepseek.server.ts # primary writer
│       ├── gemini.server.ts   # fallback writer
│       └── search.server.ts   # Tavily grounding (OD-004)
├── features/                  # each owns its components, hooks and .scss
│   ├── discovery/             # stepper · search-field · deep-dives
│   ├── scrollytelling/        # track-hero · lyric-canvas · scroll-spy
│   ├── playback/              # playback-bar · seekbar · youtube player
│   ├── insights/              # affordance · drawer · content
│   └── lyric-card/            # line selection · composer (§3.4)
├── components/                # masthead (D-059) · route-focus (D-062) · route-message · route-error
├── lib/
│   ├── types.ts               # domain shapes (ours, not LRCLIB's)
│   ├── lrc.ts                 # LRC parser → stanzas (pure, isomorphic)
│   ├── cache.ts               # CacheAdapter + memory impl (D-009)
│   ├── deep-dives.ts          # curated catalogue, scoring, explanations (D-045)
│   ├── motion.ts              # easing, durations, variants (D-004)
│   ├── script.ts              # script -> BCP-47 language guess (D-053)
│   ├── card.ts / card-metrics.ts / og.ts   # card layout + rasterising (§3.4)
│   └── clients/lrclib.ts      # LRCLIB + normalisation (D-015, D-043)
├── styles/                    # Sass partials (D-013)
│   ├── _breakpoints.scss      # mirrors Tailwind's screens
│   └── _mixins.scss           # from() · reduced-motion · surface/floating/bright · press · line-clamp (D-065)
├── styles.css                 # Tailwind entry + token layer (D-003, D-033, D-051)
└── router.tsx
```

```
public/
└── favicon.svg                # the mark: a stanza, not a musical note (D-051)
```

Import alias: `@/*` and `#/*` both resolve to `src/*` (scaffolder default; `@/*` preferred).

---

## 4. Deferred Decisions

Open. **To be ruled on explicitly — never assumed.**

| ID | Decision | Blocks | Notes |
|---|---|---|---|



| OD-005 | Genius auth strategy | `/api/track` | Server-held token; rate limits unverified |
| OD-004 | Grounding provider — Tavily wired and verified; alternatives unevaluated | §3.5 | Researcher plan, 1000 searches/mo. Without a key there is no quote at all (D-021) |
| OD-007 | Deployment target | Deploy | D-009 keeps this cheap to defer |
| OD-008 | React Compiler (`compiler` add-on) — auto-memoization | Perf | Available but NOT enabled. Interaction with `motion` unverified |
| OD-009 | Build-time env validation (`t3env` add-on) | API blocks | Attractive given 4+ secrets across OD-002..005 |
| OD-020 | ~~No component or integration tests — pure logic only~~ | Quality | **Resolved 2026-08-24 (D-077).** happy-dom rig behind a per-file pragma so the logic suite keeps its speed; first component test covers `SectionHeading`, the markup both the landing and the drawer share |
| OD-011 | Playback state store — React context vs TanStack Store | §3.2/§3.3 | Auto-scroll couples playback time to canvas |
| OD-014 | Genius rate limits are undocumented | §3.1 | Cached per artist+title for 30d. Watch for 429s |
| OD-028 | **LRCLIB search returns the wrong RECORDING, not just the wrong tagging.** Covers, LoFi edits, demos and live cuts outrank the original, and their LRC timings follow their own recording — so playback and lyrics drift apart even when both "work". Measured 2026-08-24: for "lag ja gale" the top five are all covers and Lata Mangeshkar appears nowhere; for "wonderful tonight" Eric Clapton is third behind two covers; for "holocene" a different song of the same name by Zella Day is first. Four of thirty curated entries also point at variants. Ranking currently reads well-formedness and `hasSyncedLyrics` only, and every candidate is synced, so the tie-break never fires | §3.1, §3.2 | Options under discussion: duration-cluster plausibility, variant-tag demotion, canonical-artist lookup via Genius, a version switcher on the track page, or a stated warning. See D-070 for why forcing canonical audio onto variant lyrics would make sync *worse* |
| OD-016 | LRCLIB uploads sometimes set artistName equal to trackName | §3.1 | Mitigated by ranking well-tagged entries higher; underlying data still wrong |
| OD-017 | ~~Scripts beyond Latin and Devanagari still have no face~~ | §3.4 | **Resolved 2026-08-23 (D-057).** Twelve faces added, plus Cyrillic and Greek, which this entry never listed |

| OD-018 | `@resvg/resvg-js` is native and must stay external in Vite; Workers would need the WASM build | Deploy | Already bit once — dev server failed to boot until externalised |
| OD-027 | ~~The Lyric Card is broken in the production build~~ | Deploy | **Resolved 2026-08-23 (D-058).** `harfbuzzjs` externalised alongside `@resvg`; `/api/card` and `/api/og` verified 200 in the built server |
| OD-026 | ~~`og:image` picks the first four lines~~ | §3.4 | **Resolved 2026-08-24 (D-077).** The preview now opens at the hook — the most-repeated line, counted on normalised text, which is the passage the artist chose to say more than once. Falls back to the opening when nothing repeats |
| OD-021 | ~~**Gemini free tier: 20 requests/day.** Launch blocker~~ | §3.5 | **Resolved 2026-08-22 (D-050).** DeepSeek is metered at ~$0.0001/insight; Gemini demoted to fallback, where the quota no longer gates anything |
| OD-023 | PRD §3.3 annotated phrases — Genius annotations are not fetched | §3.3 | Rescoped 2026-08-24 (D-077): the dead `.canvas__glow` rule is removed and the meta description no longer claims "annotated". Building it for real means the Genius referents API, per-phrase ranges mapped onto LRC lines, and an interaction design for tapping a phrase mid-read — a feature, not a fix |
| OD-024 | No analytics, so none of the PRD §5 metrics can be measured | Metrics | **Needs a ruling, not code** (D-077). The product's stated stance is "nothing leaves the device" (D-045's stepper reasoning), and any analytics weakens that sentence. Options: (a) keep the stance, accept unobservable metrics; (b) a cookieless self-hosted counter (Plausible-class) measuring pages and drawer-opens only; (c) full analytics. The choice changes the privacy story, so it is not made unilaterally here |


### OD-002 is a product risk, not just a technical one

The Spotify Web Playback SDK requires **every listener to hold Spotify Premium** and
complete an OAuth flow. That gates §3.2's headline auto-scroll feature behind a paywall
we do not control. The YouTube IFrame fallback is free, but its ToS is unfriendly to
audio-only playback. Neither option is clean; this may reshape the hero and should be
resolved before playback work begins.

---

## 5. Conventions

- No magic numbers in components — motion values come from `src/lib/motion.ts`, design values from the `@theme` layer.
- No faux font synthesis. Ever.
- Cache TTLs are explicit and documented at the call site.
- Secrets are server-only; no API key reaches the client bundle.
