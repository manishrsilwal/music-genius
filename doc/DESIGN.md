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
| **Elms Sans** | UI chrome, and long-form prose | Variable 100–900, real italic. Reading text is set here, not in the display face (D-044). |

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

**Set prose to a measure, not to a feeling.** 60–75 characters a line. Check
it: `(column width − padding) ÷ (font-size × 0.5)`. The insights drawer ran at
39 because `--text-lead` — a standfirst size — was doing the work of body
text in a narrow column (D-048). Half a measure costs roughly twice the
height for the same words.

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

### The page is printed in the record's ink

The extracted hue tints the paper — canvas, surfaces, hairlines — not only the
marks (D-052). A track page should be recognisably that record's page before a
single word is read.

Two rules keep it from becoming a theme switcher:

- **Lightness never moves.** Paper reuses the default lightnesses exactly and
  changes only hue and chroma. OKLCH lightness is perceptual, so this is what
  makes tinting incapable of changing a contrast ratio.
- **Surfaces are a seventh of an accent's chroma, at most, and never more than
  the cover actually had.** Area multiplies chroma. At mark strength the page
  competes with the artwork it exists to frame, and a muted cover that got
  pushed up to full saturation would be showing a colour the record does not
  contain.

The default, when a track has no usable artwork, is brass — foil on a sleeve,
the label at the centre of a record. Not vermilion on near-black, which is a
look generative design arrives at regardless of what it is designing.

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

### One scroll owner at a time

Two scroll containers whose bars land on the same viewport edge read as a
rendering fault, not as two regions. When a full-height panel opens over the
page, lock the document — and set `scrollbar-gutter: stable` so locking does
not shift the layout sideways underneath the reader.

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

### Texture, and why the page is grained

A flat dark field reads as a screen. A grained one reads as a printed page,
which is the argument the whole product is making, so a fixed `feTurbulence`
overlay sits above every surface at `0.045` opacity (D-051).

Three things make it texture rather than an effect:

- **Fixed, not scrolled.** Grain that moves with the document crawls. It
  belongs to the viewport, the way grain belongs to the film rather than to
  the scene.
- **Faint.** By `0.12` the reader is looking at the grain instead of the words.
- **Inert.** `pointer-events: none`, so sitting above modals costs nothing.

It is set to zero under `prefers-contrast: more`. Texture costs contrast, and a
reader who asked for contrast should not be paying for it.

### Elevation is tinted, and has a direction

Shadows carry the canvas hue, never neutral black — on a tinted canvas a black
shadow desaturates what it falls on and reads as a grey object rather than as
absence of light. Take a `--shadow-*` step; do not write one inline.

Direction is part of the token. `--shadow-sheet` casts **upward**, because a
surface anchored to the bottom edge throws its shadow onto what it covers.
Reusing the downward scale there lights the sheet from below.

Glass gets two insets, not one flat border: a sheen along the top edge and a
shade inside the lower one. One border renders a cut-out; two render a pane.

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

### Contrast is computed, not judged

Every ink/surface pair in this product has a measured ratio, and dimmed states
are measured too — an opacity is a contrast change wearing different clothes.
Composite it over the background it actually sits on before calling it quiet
rather than unreadable (D-053).

`--color-ink-faint` carries 12px labels, which are not large text, so it is
solved against the *worst* background it appears on rather than the first one
checked. Inactive lyric lines clear the large-text floor at 0.38; at the 0.2
they used to sit at they measured 1.68:1, which is not de-emphasis, it is
concealment.

### Failure states are designed, not defaulted

A 404, an unreachable service and an empty result are all screens a reader
will see, so they are set like the rest of the product — `RouteMessage` gives
them the hero's shape: kicker, display headline, lead, one way onward. Offer
the action that most likely fixes it (retry, search again) rather than an
apology. Never show a reader a stack trace, and never render an error's own
message outside development: it can carry a request URL or part of a key.

### A wait must be able to end

Any state that says "loading" needs a path out of it — a timeout, an error
handler, or both. A spinner with no failure path is not a loading state, it is
a dead end that looks like progress, and it tells the reader strictly less than
an error would (D-054).

When something outside our control refuses — an embed a rights holder blocked,
a service that is down — say which, and offer the nearest thing that still
works. "Watch on YouTube" is a worse outcome than playing in place, and a far
better one than a spinner.

### Point at the song, and make sure it is there

When the interface quotes the work back to the reader, the quote must be in
the work. Every line in "Why this, for you" is verified against the track's
own lyrics before it is shown, and one bad line discards the whole passage — a
paragraph pointing at a line the reader will not find costs more than the
paragraph was worth.

### Never explain a decision the explainer did not make

When the interface says *why* something happened, derive that from the code
that decided it. `explainPick` walks the same conditions as `score`, so the
stated reason cannot drift from the real one. A model asked to justify a
deterministic choice writes a plausible rationale it had no part in — the same
failure as an unsourced quote, dressed as helpfulness.

And when there is no reason, say so. "Today's rotation" is true; a
manufactured reason is not.

### Generated copy is set to a measure, like any other copy

A model with no length given will fill whatever it is offered — asked for the
drawer's synthesis without a budget it ran to 218 words where 130 reads
better. The drawer is a column beside the lyrics, not an essay, so the brief
carries an explicit budget: 45–70 words per synthesis paragraph, 35–55 per
resonance paragraph (D-050).

Paragraphing is structural, never typographic. The model returns an array of
paragraphs and the boundary joins them; it is never asked to place its own
blank lines, because a model asked for prose returns one unbroken block about
two thirds of the time (D-029). Where the provider cannot enforce that shape,
it is stated in the brief and coerced on arrival — the layout does not get to
depend on a model's good behaviour (D-050).

### Editorial integrity is a design constraint

A quote must appear verbatim in the source it cites, enforced in code and not
merely requested in the prompt (D-030). **A fabricated quote attributed to a
real artist is worse than no quote at all**, so the Quote slot going dark is
the correct outcome, not a failure to design around.

These gates belong to the product, not to a vendor. When the writing model was
swapped wholesale (D-050) not one of them changed, because none of them ever
trusted the model — which is the test of whether a safeguard is real.

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
- [ ] A change to how data is parsed bumps the cache key that stores it, in the
      same commit — otherwise 30-day entries keep serving the old bug (D-049)
- [ ] Prose styling is scoped to the prose, not to the section around it — a
      descendant selector claims every element of that type inside it (D-046)
- [ ] Nothing meaningful is hidden below a breakpoint to solve a layout
      problem; restructure instead (D-046)
- [ ] The YouTube player is never hidden, faded, clipped or covered (D-036) —
      suppress its *chrome* with `controls: 0`, never the element (D-039)
- [ ] Prose asked of a model carries a word budget and a structural shape —
      never a request for a length or a line break in prose (D-029, D-050)
- [ ] A safeguard on model output is enforced in code, not in the prompt, and
      survives changing the model (D-030, D-050)
- [ ] Shadows take a `--shadow-*` step and carry the canvas hue — never a
      neutral black, and never one written inline (D-051)
- [ ] A surface on the bottom edge casts its shadow upward (D-051)
- [ ] Overrides of a `@theme` token are written UNLAYERED — inside `@layer`
      they lose to Tailwind's own `:root` output whatever the specificity
      (D-003, D-051)
- [ ] Every page has an `id="main"` landmark for the skip link (D-051)
- [ ] Any dimmed text state is composited and measured, not eyeballed — a
      lowered opacity is a contrast change (D-053)
- [ ] A panel that opens takes focus, and returns it on close only if focus is
      still inside it (D-053)
- [ ] A surface that locks the page behind it says `role="dialog"` and
      `aria-modal`; one that does not, must not (D-053)
- [ ] Content in a script the document is not declared in carries its own
      `lang` (D-053)
- [ ] State that changes with no focus event behind it lives in a live region
      (D-053)
- [ ] Every "loading" state has a timeout and an error path — otherwise it is a
      dead end that looks like progress (D-054)
- [ ] A third-party embed is never handed a React-rendered node: it replaces
      what it is given, and React will keep referencing the corpse (D-054)
- [ ] A surface colour derived from artwork keeps the default's lightness and
      moves only hue and chroma — otherwise it is a contrast change wearing a
      palette's clothes (D-052)
- [ ] A token that must reach the page background is set on `body`, not on a
      subtree — custom properties inherit downward only (D-052)
- [ ] A new route that can be shared carries `og:title`, `og:description` and
      an ABSOLUTE `og:image` — crawlers drop a relative one (D-051)

---

## 10. Recent changes

| Date | Change |
|---|---|
| 2026-08-22 | **D-054** Playback gains real failure states, timeouts and a "Watch on YouTube" fallback; player no longer built on a React-owned node |
| 2026-08-22 | **D-053** Two measured contrast failures fixed; drawer focus management and dialog semantics; per-script `lang`; canonical, robots, sitemap, structured data; artwork fetch allowlisted |
| 2026-08-22 | **D-052** The page takes the record's hue — paper as well as marks; default accent moves from vermilion to brass |
| 2026-08-22 | **D-051** Film grain, tinted elevation, hero vignette, glass thickness; skip link, `prefers-contrast`, favicon and per-track social cards |
| 2026-08-22 | **D-050** Drawer copy gains an explicit word budget; writing model swapped with no change to any output gate |
| 2026-08-22 | **D-049** Channel-upload titles retried against Genius; all four cache keys versioned |
| 2026-08-22 | **D-048** Drawer measure fixed at 69 characters; one scroll owner; labels separate sections |
| 2026-08-22 | **D-047** "Why this, for you" in the drawer — personal, quoting verified lines |
| 2026-08-22 | **D-046** Section labels unified; "why this" shows at every width |
| 2026-08-22 | **D-045** Deep Dives explain themselves, from the real scoring plus a curated note |
| 2026-08-22 | **D-044** Insights synthesis set in Elms Sans, not the display face |
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
