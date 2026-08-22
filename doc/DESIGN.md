# Design Conventions — Typographic Lyrical Explorer

The rules this interface holds itself to, and why. Architecture decisions live
in [ARCHITECTURE.md](./ARCHITECTURE.md); this file is about what the reader
sees and touches. Where a rule exists because something broke, the decision is
cited so the reasoning is recoverable.

**The premise:** lyrics as editorial reading. Every rule below is downstream of
that. Chrome stays quiet, type carries the hierarchy, and motion has a reason.

---

## 1. Type

Set in three faces, each with one job (D-005, D-019).

| Face | Role | Notes |
|---|---|---|
| **Rufina** | Display — hero, lyrics, titles | 400/700. **No italic exists.** Zero Devanagari coverage. |
| **Vesper Libre** | Devanagari | Sits *after* Rufina in the stack, so Latin resolves to Rufina and Devanagari falls through per glyph. |
| **Elms Sans** | UI chrome — labels, captions, buttons | Variable 100–900, real italic. |

`font-synthesis: none` is set on every display element. Rufina ships no italic,
and a browser-synthesised oblique shears the letterforms — a stray `<em>`
inside a lyric must not be allowed to do that.

### Scale

Fluid, `clamp()`-based, so nothing needs a breakpoint to stay readable.

```
--text-hero      clamp(3.25rem, 13vw, 11rem)      Track hero only
--text-display   clamp(2.5rem, 7vw, 5.5rem)       Page-level titles
--text-lyric     clamp(1.5rem, 4.2vw, 2.75rem)    The canvas
--text-title     clamp(1.5rem, 2.6vw, 2.25rem)    Section heads
--text-lead      clamp(1.125rem, 1.6vw, 1.375rem) Synthesis, quotes
--text-body      1rem
--text-caption   0.875rem
--text-micro     0.75rem                          Labels, status
```

**Long strings are fitted, not just clamped.** A viewport-driven `clamp()`
asks how wide the screen is, never how long the text is — so every hero title
rendered at the same cap and long ones wrapped to two or three lines. Size
display strings against their own measured width via `measureEm` and a
`container-type` wrapper (D-037). Never assume an average glyph advance;
Rufina varies by 8% across equal character counts.

**A step is chosen for its role, not its size.** The landing hero uses a
capped `clamp(2rem, 4.5vw, 3rem)` rather than `--text-display` because the
first question has to sit above the fold — that is a page-specific size, not a
new rung on the scale (D-028).

`--tracking-label: 0.14em` with uppercase is the label voice. It appears on
every micro-label; nothing else uses letterspacing.

---

## 2. Colour

OKLCH throughout, for perceptually even lightness steps.

```
--color-canvas          Page ground
--color-surface         Cards, bars, drawers
--color-surface-raised  Hover, selected
--color-hairline        Borders — white at 9% alpha
--color-ink             Primary text
--color-ink-muted       Secondary
--color-ink-faint       Labels, hints
```

### The accent is not a brand colour

`--track-accent`, `--track-accent-soft` and `--track-glow` are **extracted from
the album art at runtime** and rewritten per track. Everything tinted follows.
Use the token; never hard-code a hue.

Extraction is normalised into a fixed lightness/chroma band so that a muddy
cover cannot produce unreadable text: lightness is pinned per role, chroma
clamped to `0.09–0.19`. Covers below `0.02` chroma are treated as achromatic
and rejected outright — without that, a greyscale cover has no hue to report,
hue defaults to `0`, and the floor invents a confident red that is nowhere in
the artwork.

> **Satori does not understand OKLCH.** Server-rendered cards convert to sRGB
> hex first. Passing a token straight through renders a solid black card with
> no error at all.

---

## 3. Layering and the dock

**Every floating element takes a named layer. Nothing writes a bare number.**

```
--layer-hero-art     -2
--layer-hero-veil    -1
--layer-autocomplete 20
--layer-dock         35   Playback bar + Discover button
--layer-overlay      45   Insights drawer, panel and sheet
--layer-tooltip      50
--layer-modal        60   Card composer
```

This scale exists because its absence caused a bug (D-033). Six ad-hoc
z-indexes lived in five files, and the Discover button and the playback bar
both claimed `right: 1.5rem; bottom: 1.5rem` — neither file knew the other
existed, so the button rendered on top of the bar.

### The player opens in the hero, then docks

One instance, two modes — docking is a class change, never a remount, because
a remount tears down the YouTube player and restarts playback. In the hero it
is a compact pill; docked it spans the viewport at `bottom: 0` with contents
centred inside `--dock-measure`.

**Read a scroll threshold from a sentinel, never from the element that moves.**
An element that goes `fixed` when it leaves the viewport is instantly back
inside it, and flip-flops at the switch point. Keep a zero-width sentinel in
flow, and reserve the moved element's height in its slot so the page does not
jump under the reader.

### The dock is one thing, not two

The bottom-right corner is a **single dock** shared by the playback bar and the
Discover button. They sit on the *same* layer and stack by offset, because
they are not competing — they are queued.

```
--dock-inset   1.5rem     Distance from the corner (desktop)
--dock-gap     0.75rem    Between stacked dock items
--dock-pad     Bar's internal padding
--dock-height  4.5rem mobile · 6rem from `md`
--dock-safe    env(safe-area-inset-bottom, 0px)
--dock-reach   How far up from the viewport floor the bar reaches
```

**The bar's height is declared, and its contents are sized to fit it** — not
the other way round. The video takes `--dock-height` minus padding and derives
its width from `16/9`. That inversion is what makes `--dock-reach` true by
construction, so anything stacking above can offset by it without measuring.

### Position is resolved in one place

Where the Discover button sits depends on whether the bar is present, whether
the drawer is open, and which breakpoint. Written as competing descendant
rules these collide silently: `.track-shell:has(.playback) .discover` and
`.track-shell[data-drawer="open"] .discover` **both score (0,3,0)**, so source
order decides and the wrong one wins.

Resolve it as a single inherited custom property instead, nested so each case
plainly out-specifies the one above:

```scss
.track-shell {
  --discover-bottom: calc(var(--dock-inset) + var(--dock-safe));
  &:has(.playback)              { /* stack above the bar */ }
  &[data-drawer="open"] {
    @include m.from("lg")       { /* translate clear of the panel */ }
    @include m.until("lg")      { /* ride above the sheet */ }
  }
}
.discover { bottom: var(--discover-bottom, …); }
```

> **`position: fixed` ignores an ancestor's padding.** The drawer compresses
> the canvas with `padding-right`, which moved the lyrics and nothing else —
> so the panel opened on top of the playback bar *and* on top of the button
> that closes it. Fixed dock children are translated by the same amount the
> canvas is padded.

> **Never nest a `position: fixed` overlay inside another.** `position: fixed`
> creates a stacking context, so a drawer nested in the dock could never rise
> above it. The dock and the overlays are siblings.

### A reading column has one scroll axis

Never put a horizontal scroller inside a vertical reading column. Two axes
compete, and a carousel shows less of the set than a list does in the same
height. Set `overflow-x: clip` on scroll containers — `clip`, not `hidden`, so
the element cannot itself become a scroll container.

**A bleed must have something to bleed into.** `margin-inline: -Npx` inside a
container padded by exactly `N` makes the child wider than the content box; if
that container scrolls on either axis, the other axis silently becomes `auto`
and a scrollbar appears.

### Safe areas

Anything touching the bottom edge adds `env(safe-area-inset-bottom, 0px)` —
the playback bar and the mobile sheet both do. Without it they sit under the
iPhone home indicator.

---

## 4. Motion

`src/lib/motion.ts` is the source of truth for JS-driven animation; the easing
curves are mirrored in `styles.css` for CSS-driven cases. **Changing one means
changing the other.** Components must not contain magic numbers.

```
duration.instant   0.12   Exits under AnimatePresence mode="wait"
duration.quick     0.22   Hover, small state changes
duration.base      0.42   The default settle
duration.slow      0.68
```

```
ease.editorial  Decisive start, long calm tail — the house curve
ease.entrance   Arriving without bounce
ease.exit       Accelerate away, no lingering
```

`transition.sheet` is a spring, not a tween. A gesture that ends should feel
like it carries momentum; everything else is a tween.

### Exits are not entrances

Under `AnimatePresence mode="wait"` the two run **in sequence**, so the reader
waits through both. Matching durations doubles the perceived delay of every
step — 0.84s per tap in the preference stepper, which read as lag the moment
the Continue button stopped absorbing it (D-032). Use `transition.dismiss`:
what is leaving has already been decided.

### Reduced motion

Every animated rule carries an `@include m.reduced-motion` branch. **Degrade,
do not disable** — the interface should still change state, just without the
travel.

---

## 5. Interaction

### Focus is written once

```css
:where(a, button, summary, [tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--track-accent);
  outline-offset: 3px;
  border-radius: inherit;
}
```

An **opt-out, not an opt-in** (D-035). Six of seven controls previously had no
focus style, each falling back to a default outline that a dark glassmorphic
surface all but swallows. `:where()` keeps specificity at zero, so a component
that needs a different ring simply writes one and wins.

### Reach for the platform control first

A scrub track is an `<input type="range">`, not a styled `div` with pointer
handlers. Drag, keyboard, focus and screen-reader semantics arrive correct and
free; a rebuild is always worse. Style it through its pseudo-elements
(`::-webkit-slider-runnable-track`, `::-moz-range-track`) and paint state into
the track's own background from a custom property rather than adding a second
element to keep in sync.

**An invisible input never overhangs its container.** A control half-hanging
above a bar pinned to the viewport floor swallows clicks meant for what is
behind it.

### Touch targets

**44px minimum.** WCAG 2.5.8 requires only 24px, which is too mean for a bar
tapped one-handed while reading.

Grow the *target*, not the control: `@include m.tap-target` centres a
transparent `::after` at the minimum size. Padding is the wrong tool — the
dock's height is declared, and growing a child would falsify it.

### Tap advances; nothing waits for a button

Every step of the preference stepper commits on tap. Mood was briefly
multi-select, which made it the one step that *could* not — a multi-select has
no natural commit signal, so it needed a Continue button that the other two
steps made look like friction (D-032).

The general rule: **if a control can commit on tap, it must.** A button is for
a terminal action or a genuinely multi-part choice, not for confirming a
single selection.

### Progress is marks, not a bar

A progress bar measures what is *left*, which is the anxious framing for a
three-question flow that is supposed to feel light.

---

## 6. Surfaces

`@include m.glass` is the one glass treatment (PRD §3.2). It reads the runtime
tokens, so a track's extracted palette flows through without touching the
mixin.

```
--glass-bg      white at 6%
--glass-border  white at 14%
--glass-blur    20px
--radius-card   1.25rem
--radius-sheet  1.75rem
```

Always pair `backdrop-filter` with `-webkit-backdrop-filter`; the mixin does.

---

## 7. Responsive

Breakpoints mirror Tailwind's exactly, so Sass media queries and Tailwind
variants can never disagree about where a layout changes.

```
sm 40rem · md 48rem · lg 64rem · xl 80rem
```

`@include m.from($name)` and `@include m.until($name)` are exclusive
complements — `from("lg")` and `until("lg")` never both match.

**Two behaviours, not one component restyled.** The insights drawer is a
compressing side panel on desktop and a swipeable bottom sheet on mobile
(PRD §3.5). A 30% panel that reads well on a desktop breaks the reading
experience on a phone; the two are rendered as separate elements sharing one
content component, so they cannot drift apart.

---

## 8. Writing

Interface copy addresses an intelligent adult.

- **No hedging.** Not "this song appears to be about"; say what it is about.
- **Labels are nouns, not instructions.** "The Synthesis", not "Read the summary".
- **Say what is true when a feature cannot deliver.** With no grounding sources
  the drawer says the synthesis was written from the lyrics alone and no quote
  is shown — rather than quietly omitting the slot.
- **Skipping is a real answer**, and is labelled as one: "Skip · show me anything".

### Failure states are designed, not defaulted

A 404, an unreachable service and an empty result are all screens a reader
will see, so they are set like the rest of the product — `RouteMessage` gives
them the hero's shape: kicker, display headline, lead, one way onward. Offer
the action that most likely fixes it (retry, search again) rather than an
apology. Never show a reader a stack trace, and never render an error's own
message outside development: it can carry a request URL or part of a key.

### Editorial integrity is a design constraint

A quote must appear verbatim in the source it cites, enforced in code and not
merely requested in the prompt (D-030). **A fabricated quote attributed to a
real artist is worse than no quote at all**, so the Quote slot going dark is
the correct outcome, not a failure to design around.

---

## 9. Conventions checklist

Before shipping a component:

- [ ] No bare `z-index` — take a `--layer-*`
- [ ] Nothing floats in the bottom-right without joining the dock
- [ ] Anything on the bottom edge adds `--dock-safe`
- [ ] Interactive targets reach 44px, via `tap-target` if padding would lie
- [ ] Every animated rule has a `reduced-motion` branch
- [ ] Durations and easings come from `motion.ts` or the mirrored CSS tokens
- [ ] Accent colours come from `--track-accent*`, never a literal hue
- [ ] Display text sets `font-synthesis: none`
- [ ] A control that can commit on tap does
- [ ] `@apply` is never used in `.scss` — it silently no-ops (D-004)
- [ ] The YouTube player is never hidden, faded, clipped or covered (D-036) —
      suppress its *chrome* with `controls: 0`, never the element (D-039)

---

## 10. Recent changes

| Date | Change |
|---|---|
| 2026-08-22 | **D-043** Sources become a numbered reference list; the quote's citation is now followable |
| 2026-08-22 | **D-041** Route error boundaries; a dead end is set like the rest of the product |
| 2026-08-22 | **D-040** Docked bar gains a full-width scrub track, icon play/pause and a clock |
| 2026-08-22 | **D-039** YouTube chrome suppressed via `controls: 0`; the player itself stays displayed |
| 2026-08-22 | **D-038** Player opens in the hero, docks to a full-width sticky bar on scroll |
| 2026-08-22 | **D-037** Hero title fitted to its own measured width, not just the viewport |
| 2026-08-22 | **D-036** Playback bar led by a spinning album record; player kept visible but quiet |
| 2026-08-22 | **D-035** Focus ring written once as an opt-out; 44px tap targets via `tap-target` |
| 2026-08-22 | **D-033** Layer scale and shared dock; fixes Discover/playback overlap, drawer covering the dock, and missing safe areas |
| 2026-08-22 | **D-032** Every stepper step advances on tap; mood single-select; `transition.dismiss` for `mode="wait"` exits |
| 2026-08-22 | **D-031** Source gallery gets thumbnails — YouTube stills for video, favicons for articles |
| 2026-08-22 | **D-029** Synthesis paragraphs are structural, so the drawer stops rendering a wall of text |
| 2026-08-22 | **D-028** Landing hero capped so the first question sits above the fold |
