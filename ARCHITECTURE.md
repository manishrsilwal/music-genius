# Architecture — Typographic Lyrical Explorer

Living decision record. Every architectural, API, and state-management decision is
logged here with its rationale and its rejected alternatives.

**Rule:** nothing is decided by assumption. Anything unresolved lives in
[Deferred Decisions](#deferred-decisions) until explicitly ruled on.

- **Status:** Block 2 — visual layer wired (Genius + palette); awaiting a token to verify against live artwork
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
| OD-001 | Cache backend concrete impl | `/api/track` | Follows D-009. Upstash Redis likely (HTTP ⇒ runtime-agnostic) |
| OD-002 | Audio SDK: Spotify vs YouTube | §3.2 playback | **Product risk** — see below |
| OD-003 | LLM provider: Gemini vs OpenAI | `/api/insights` | Cost/latency/quality tradeoff |
| OD-004 | Search API: Tavily vs Google | `/api/insights` | |
| OD-005 | Genius auth strategy | `/api/track` | Server-held token; rate limits unverified |
| OD-006 | Pull-quote treatment given no Rufina italic | §3.5 | Options to be presented |
| OD-007 | Deployment target | Deploy | D-009 keeps this cheap to defer |
| OD-008 | React Compiler (`compiler` add-on) — auto-memoization | Perf | Available but NOT enabled. Interaction with `motion` unverified |
| OD-009 | Build-time env validation (`t3env` add-on) | API blocks | Attractive given 4+ secrets across OD-002..005 |
| OD-010 | Testing strategy — none scaffolded | Quality | No runner installed; `--no-examples` skipped test setup |
| OD-011 | Playback state store — React context vs TanStack Store | §3.2/§3.3 | Auto-scroll couples playback time to canvas |
| OD-014 | Genius rate limits are undocumented; autocomplete does up to 8 artwork lookups per cold search | §3.1 | Mitigated by caching each lookup by artist+title for 30d. Watch for 429s |
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
