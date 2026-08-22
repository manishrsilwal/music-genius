# Architecture — Typographic Lyrical Explorer

> Design conventions — type, colour, layering, motion, interaction —
> live in [DESIGN.md](./DESIGN.md).

Living decision record. Every architectural, API, and state-management decision is
logged here with its rationale and its rejected alternatives.

**Rule:** nothing is decided by assumption. Anything unresolved lives in
[Deferred Decisions](#deferred-decisions) until explicitly ruled on.

- **Status:** Block 5 — all PRD features implemented. Insights await a Gemini key to verify against real output
- **Previously:** Block 3 complete — Lyric Card export shipping; selection → composer → PNG verified
- **Last updated:** 2026-08-21
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
> search per uncached track. Far less binding than Gemini's 20/day (OD-021).

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
**Decided 2026-08-22.** Gemini returns `synthesis` as an array of paragraphs;
`gemini.server.ts` joins them with blank lines at the boundary.

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

> **Quota:** the free tier allows **20 generate-content requests per day**. The
> 30-day cache absorbs repeat views, so this is workable in development, but it
> is a **launch blocker**: 20 uncached tracks per day across all users, then the
> drawer 502s. Resolve before deploy — either billing, or pre-warming the
> curated catalogue into the cache. Tracked as OD-021.

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
**Decided 2026-08-22.** Gemini via REST (OD-003); Tavily for grounding (OD-004).

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
│   ├── __root.tsx             # shell, head/meta
│   ├── index.tsx              # discovery + search (§3.1)
│   ├── track.$trackId.tsx     # hero + canvas (§3.2, §3.3)
│   └── api/
│       ├── search.ts          # GET /api/search?q=
│       └── track.ts           # GET /api/track?id=
├── server/                    # server-only; never imported by the client
│   ├── lyrics.server.ts       # business logic (D-014)
│   └── lyrics.functions.ts    # createServerFn boundary for loaders
├── features/
│   ├── discovery/             # search-field + use-debounced
│   ├── scrollytelling/        # lyric-canvas + use-scroll-spy
│   └── playback/ lyric-card/ insights/     # (empty)
├── components/ui/
├── lib/
│   ├── types.ts               # domain shapes (ours, not LRCLIB's)
│   ├── lrc.ts                 # LRC parser → stanzas (pure, isomorphic)
│   ├── cache.ts               # CacheAdapter + memory impl (D-009)
│   ├── motion.ts              # easing, durations, variants (D-004)
│   └── clients/lrclib.ts      # LRCLIB + normalisation (D-015)
├── styles/                    # Sass partials (D-013)
│   ├── _breakpoints.scss      # mirrors Tailwind's screens
│   └── _mixins.scss           # from() · reduced-motion · glass · line-clamp
├── hooks/
├── styles.css                 # Tailwind entry + token layer (D-003)
└── router.tsx
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
| OD-020 | No component or integration tests — pure logic only (D-023) | Quality | Needs a DOM environment and fixture servers |
| OD-011 | Playback state store — React context vs TanStack Store | §3.2/§3.3 | Auto-scroll couples playback time to canvas |
| OD-014 | Genius rate limits are undocumented | §3.1 | Cached per artist+title for 30d. Watch for 429s |
| OD-016 | LRCLIB uploads sometimes set artistName equal to trackName | §3.1 | Mitigated by ranking well-tagged entries higher; underlying data still wrong |
| OD-017 | Scripts beyond Latin and Devanagari still have no face — Arabic, Bengali, Tamil, CJK would render as tofu | §3.4 | Same class of bug as D-019. Needs a face per script the catalogue serves |

| OD-018 | `@resvg/resvg-js` is native and must stay external in Vite; Workers would need the WASM build | Deploy | Already bit once — dev server failed to boot until externalised |
| OD-021 | **Gemini free tier: 20 requests/day.** Launch blocker — needs billing or a pre-warmed catalogue | §3.5 | Accepted for development 2026-08-22 (D-029). Cache absorbs repeats, not first views |
| OD-022 | No `errorComponent` on any route — a loader throw renders the framework default | Quality | LRCLIB or Genius being down is a normal Tuesday, not an exception |
| OD-023 | PRD §3.3 annotated phrases are styled but never populated — Genius annotations are not fetched | §3.3 | The `.lyric__annotated` rule exists and nothing applies it |
| OD-024 | No analytics, so none of the PRD §5 metrics can be measured | Metrics | Lyrics <500ms, 30% drawer engagement, 10% card export are all unobservable |
| OD-025 | No CI — typecheck, Biome and tests run only when someone remembers | Quality | Everything needed already runs in one command |


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
