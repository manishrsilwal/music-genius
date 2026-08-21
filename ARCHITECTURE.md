# Architecture — Typographic Lyrical Explorer

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



| OD-004 | Search API: Tavily vs Google | `/api/insights` | |
| OD-005 | Genius auth strategy | `/api/track` | Server-held token; rate limits unverified |
| OD-004 | Grounding provider — Tavily wired; alternatives unevaluated | §3.5 | Without a key there is no quote at all (D-021) |
| OD-007 | Deployment target | Deploy | D-009 keeps this cheap to defer |
| OD-008 | React Compiler (`compiler` add-on) — auto-memoization | Perf | Available but NOT enabled. Interaction with `motion` unverified |
| OD-009 | Build-time env validation (`t3env` add-on) | API blocks | Attractive given 4+ secrets across OD-002..005 |
| OD-020 | No component or integration tests — pure logic only (D-023) | Quality | Needs a DOM environment and fixture servers |
| OD-011 | Playback state store — React context vs TanStack Store | §3.2/§3.3 | Auto-scroll couples playback time to canvas |
| OD-014 | Genius rate limits are undocumented | §3.1 | Cached per artist+title for 30d. Watch for 429s |
| OD-016 | LRCLIB uploads sometimes set artistName equal to trackName | §3.1 | Mitigated by ranking well-tagged entries higher; underlying data still wrong |
| OD-017 | Scripts beyond Latin and Devanagari still have no face — Arabic, Bengali, Tamil, CJK would render as tofu | §3.4 | Same class of bug as D-019. Needs a face per script the catalogue serves |

| OD-018 | `@resvg/resvg-js` is native and must stay external in Vite; Workers would need the WASM build | Deploy | Already bit once — dev server failed to boot until externalised |
| OD-013 | "Today's Deep Dives" curation — which tracks, refreshed how | §3.1 | Needs OD-003/OD-004 for pre-generated backstories |

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
