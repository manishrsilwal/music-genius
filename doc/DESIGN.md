# Design Conventions — Typographic Lyrical Explorer

The rules this interface holds itself to, and why. Architecture decisions live
in [ARCHITECTURE.md](./ARCHITECTURE.md); this file is about what the reader
sees and touches. Where a rule exists because something broke, the decision is
cited so the reasoning is recoverable.

**The premise:** lyrics as editorial reading. Every rule below is downstream of
that. Chrome stays quiet, type carries the hierarchy, and motion has a reason.

---

## 1. Type

Set in two faces plus one companion per script, each with one job (D-005,
D-019, D-064).

| Face | Role | Notes |
|---|---|---|
| **Fraunces** | Display — hero, lyrics, titles | Variable, all four axes: weight, `opsz`, `SOFT`, `WONK`. Ships a **real italic**. Latin + latin-ext only. |
| **Outfit** | UI chrome, and long-form prose | Variable geometric sans, 32KB. Reading prose is set here, not in the display face (D-044). |
| **Vesper Libre + 12 others** | Devanagari, Arabic, Tamil, Thai, Hebrew, Cyrillic, Greek, CJK… | Sit *after* Fraunces in the stack, with explicit `unicode-range`, so Latin resolves to Fraunces and every other script falls through per glyph (D-057). CJK is chosen by language, never by glyph. |

**Fraunces' axes are set per role, and set explicitly** (D-065). The hero pins
`opsz` 144 with `SOFT` 40; `font-optical-sizing: auto` would track the
*computed* size, and the hero's size is a `min()` of three terms, so a long
title that shrank to fit would also get a different, text-weight drawing of the
letterforms. The lyric canvas pins `opsz` 32 with SOFT and WONK at zero —
someone else's words, read at length, where the face's job is to disappear. The
wonk belongs to the landing headline's one italic word, where the product is
speaking in its own voice.

`font-synthesis: none` is still set on every display element — for the opposite
reason to before. Fraunces *has* a drawn italic and it is loaded, so the browser
must use that one or nothing, never a sheared upright.

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
Fraunces varies by 8% across equal character counts.

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

The default, when a track has no usable artwork, is **lime** — the brand
accent, standing in for a record that has not been opened yet (D-064). It is
also what the whole product outside a track page is painted in, which is why
the landing comes out in the brand's own colour rather than in a neutral
placeholder.

Because `ACCENT_LIGHTNESS` is pinned at 0.72 by the extractor, `--color-on-bright`
clears 4.5:1 on top of **any** accent this channel can ever hold — worst measured
case 6.96:1, swept across all 360 hues at every chroma in the band. That is what
makes a *filled* accent control safe to use on a page whose accent is unknown
until the artwork resolves (D-065).

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
focus style, each falling back to a default outline that a saturated surface
all but swallows. `:where()` keeps specificity at zero, so a component
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

Three mixins, and no glass (D-065).

| Mixin | What it is | Where |
|---|---|---|
| `surface($bg)` | Solid fill + hairline | Cards, chips, panels, popovers |
| `floating($bg)` | `surface` on the raised step + `--shadow-2` | Chrome that sits over content: masthead, dock, autocomplete |
| `bright` | Filled `--track-accent` with `--color-on-bright` ink | **One per view.** The thing to press |

```
--radius-pill    999px      controls
--radius-nested  0.875rem   inner elements — thumbnails, swatches, art
--radius-card    1.75rem    cards, popovers, panels
--radius-sheet   2.25rem    the composer, the mobile drawer
```

Nested corners are deliberately *tighter* than the box holding them: a
thumbnail at the card's own radius reads as a sticker sitting on the card
rather than as part of it.

**Glassmorphism was removed rather than tuned.** A translucent panel takes its
contrast from whatever is behind it, and behind the masthead and the dock that
is full-bleed album art — a different colour on every track. Nothing on those
surfaces had a ratio that could be *stated*, only one that happened to hold for
the cover being looked at. Every surface now declares its own colour.

**Elevation is contrast against the ground, not a fixed direction.** The bright
canvas steps *down* to raise a surface; the reading ground steps *up*. Because
of that, hover is a translucent white veil (`--color-hover`) rather than "the
next surface along" — the latter would lighten a row on one page and darken it
on the other.

| Token | Use |
|---|---|
| `--color-hover` / `--color-hover-strong` | Row and control hover, on either ground |
| `--color-well` | A recess: the slot an image has not arrived in yet |

> **Tokens used only from SCSS must be declared in the `@theme static` block.**
> Tailwind v4 tree-shakes theme tokens it cannot see used and does not scan
> `.scss`. This has now silently dropped tokens from a build twice — the brand
> accents in D-064, and every hover state in D-065.

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

### A returning reader is not a new one

The second visit should not look like the first. A page whose only state is
"has answered the questions" tells a reader who has been here twenty times that
it has never met them (D-056).

Two rules keep that from becoming clutter:

- **A personal shelf renders nothing when it is empty.** An empty state
  explaining what would eventually appear there is chrome charging rent for a
  feature the reader has not used.
- **Anything remembered can be forgotten, per item.** Reading history is
  personal; removing one row must not cost the reader the rest, and the control
  is always visible, because a hover-only control does not exist on a touch
  screen.

### Structure arrives before content

A component that depends on slow data renders its own shape immediately and
fills in — it does not wait behind a `null` fallback and then appear (D-055).
An element that pops into a settled layout costs the reader their place, and
for the seconds before it arrives the feature simply does not exist as far as
they can tell.

The corollary: a deferred promise gets its own `<Await>` per timescale. Bundling
a one-second fetch with a three-second one means the reader waits three seconds
for both.

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

### A typeface is a promise about which words you can set

The display face covers Latin and latin-ext and nothing else. For a product
whose whole argument is that lyrics deserve to be *set*, that meant the argument
only held in one alphabet — a Tamil song got boxes on its shareable card, and a
system fallback on the page that matched neither the display face nor the card
it exported to.

The fix is one companion face per script, chosen so the page still reads as one
product: Amiri's classical naskh carries roughly the display face's stroke
contrast, the way Vesper Libre's transitional Devanagari already did. The
companions survived the D-064 redesign untouched — they are functional coverage,
not style, and a redesign has no business removing Tamil support. A humanist face would
have set Arabic accurately and made it look like a different website.

**Scope was measured.** 519 tracks sampled from the source catalogue: 67%
carried a non-Latin script, and the three most common — Han, Arabic, Kana —
were all unsupported. Devanagari, the one script that *was* supported, turns out
to be mostly stored romanised.

**Han is not one script.** Japanese, Chinese and Korean share codepoints and
draw them differently, so "fall back per glyph" — correct for every other
script, since their ranges do not overlap — silently sets Chinese in Japanese
shapes. That one is chosen by the document's language instead. The general rule
only looked general because nothing had tested its edge.

**Check what the browser can rule out.** A fallback face with no declared range
cannot be dismissed without being downloaded first, so a single stray character
can pull a megabyte of Korean onto an English page. Declaring the range is what
makes "only load what this page needs" true rather than assumed.

### A way home is not a link, it is a fixture

The product had a "persistent way out" that was hidden on phones and, because a
mixin quietly overrode its `position`, scrolled away on everything else. Both
faults read as present in the source and as working in a screenshot taken at the
top of the page.

So the rule is structural rather than visual: the way home is rendered once, in
the root document, and every route gets it in the same place without opting in.
A page cannot forget to include it, and there is no breakpoint at which it is
absent — below `sm` the wordmark drops and the mark stays, because the half that
survives should be the half that still functions at 16px.

The mark is three rules of unequal length: a stanza, which is the one shape this
product is about. It is the only element on screen the record does not repaint —
an identity that changes colour per page stops being one.

### Offer both doors in the same breath

A reader arrives either knowing the song or not. The landing had a route for
each and put them at opposite ends of the page, so the reader who did not know
what they wanted met a blank field first and the mood chips only after scrolling
past everything they could not use. Naming both at the moment of the choice
costs one divider and removes the need to guess.

### A swap is not free just because it is fast

`font-display: swap` guarantees the reader sees words immediately. It says
nothing about what happens when the real face arrives. Fraunces is 6.0% wider
per character than Georgia and 16.7% wider than Times New Roman, and sits on a
taller ascent, so the moment it loaded, every line re-wrapped and every line box
changed height — a lurch, on a product whose hero is set at 11rem. (Both numbers
were re-measured when the face changed; the generator makes that one command.)

The fix is to make the stand-in wear the real face's measurements:
`size-adjust` and the `*-override` descriptors, computed from both fonts rather
than eyeballed. It costs nothing — the fallback is a font the reader already
owns — and the numbers are generated, so changing a display face cannot leave a
stale adjustment behind.

The general rule: a placeholder should be the same *size* as the thing it is
holding space for. That is the same instinct as reserving a skeleton's height,
applied one level down, to the glyph.

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
- [ ] A component behind deferred data renders its shell immediately — never
      `fallback={null}` for something the layout is built around (D-055)
- [ ] Data on different timescales gets different promises (D-055)
- [ ] "Empty" and "still loading" never share a message (D-055)
- [ ] A list that can render zero rows still guards its keyboard handler — the
      panel being open is not proof there is anything to arrow through (D-056)
- [ ] Anything read back from storage is parsed and bounded, never trusted:
      it is user-writable and outlives the code that wrote it (D-047, D-056)
- [ ] A control on the bottom edge takes the dock's resolved offset rather than
      computing its own (D-033, D-056)
- [ ] A surface colour derived from artwork keeps the default's lightness and
      moves only hue and chroma — otherwise it is a contrast change wearing a
      palette's clothes (D-052)
- [ ] A token that must reach the page background is set on `body`, not on a
      subtree — custom properties inherit downward only (D-052)
- [ ] A new route that can be shared carries `og:title`, `og:description` and
      an ABSOLUTE `og:image` — crawlers drop a relative one (D-051)
- [ ] A new script in the language detector ships with a face for it — labelling
      a language correctly and then rendering it as boxes is worse than not
      labelling it (D-057)
- [ ] Every webfont declares a `unicode-range`; a face the browser cannot rule
      out is a face it must download to check (D-057)
- [ ] A `:lang()` rule targets the element that actually carries `lang` — on
      this site that is the lyric canvas, never `<html>` (D-057)
- [ ] Anything the page and the exported card both render uses the same face,
      resolved the same way — satori has no system fallback (D-019, D-057)
- [ ] A hand-typed asset path is asserted against the filesystem in a test; it
      fails otherwise only in production, for the reader least likely to say so
      (D-057)
- [ ] Type sized from measured advances covers the script being set — a
      full-width character measured as half-width overflows the frame (D-058)
- [ ] `lang` asserts what a run of text IS; a typeface choice about the page
      uses its own attribute. Do not overload one for the other (D-058)
- [ ] Navigation that must always be reachable is rendered once at the root, not
      per route — a page cannot then forget it (D-059)
- [ ] A responsive rule drops the ornament, never the function: hide the
      wordmark, keep the link (D-059)
- [ ] A longhand set before a mixin can be overridden BY that mixin. Check the
      compiled rule, not the source — `position: fixed` lost to `tap-target`
      and looked correct at scroll 0 (D-059)
- [ ] Where a screen offers two routes to the same goal, both are visible at the
      moment of choosing (D-059)
- [ ] Chrome fixed to an edge is matched by `scroll-padding` on that edge, from
      the same token — otherwise focus scrolls underneath it (D-060)
- [ ] Every input has a visible label. A placeholder is a hint, not a label, and
      it disappears when it is most needed (D-060)
- [ ] An `aria-label` beside a visible label overrides it. Pick one (D-060)
- [ ] A spacing number needed in two places is a token, not two numbers (D-060)
- [ ] A webfont ships with a metric-matched `local()` fallback; `swap` alone
      guarantees the jump, it does not soften it (D-061)
- [ ] Anything that responds to a click shows a pointer. `<button>` does not get
      one for free (D-061)
- [ ] A generated design direction is evidence, not instruction. It does not
      outrank a decision this project already reasoned through (D-061)
- [ ] A client-side route change moves focus to the main landmark — the browser
      does this across documents and a router does not (D-062)
- [ ] `disabled` says unavailable; `aria-busy` says working. A slow action needs
      both (D-062)
- [ ] Every inline SVG carries width and height as well as CSS size (D-062)
- [ ] A screen offering two routes says so in words; a divider and two labels
      only read as a choice to someone already looking for one (D-063)
- [ ] Read the whole screen for the same sentence written twice — a new line of
      copy often duplicates one already below it (D-063)

---

## 10. Recent changes

| Date | Change |
|---|---|
| 2026-08-25 | **D-080** The cover is the record; the player is a card with a real scrub row; one Sync control replaces a Resync that could never render; drift threshold retuned on a measured false positive |
| 2026-08-25 | **D-079** Desktop split view — sticky rail (art, title, player) beside a scrolling lyric column; the player joins the words' axis and the dock retires itself at `lg` |
| 2026-08-24 | **D-078** The hero lockup: cover beside the words on wide screens, above them on a phone; blurred ground drops to 0.45; centred fallback when no art resolves |
| 2026-08-24 | **D-077** Register cleared: og:image opens at the hook, a component-test rig with a first SectionHeading test, the dead annotation rule removed, analytics returned as a ruling |
| 2026-08-24 | **D-076** The docked bar rides a measured cream sheet with a derived deep accent; "Read next" offers two doors at the foot of every track |
| 2026-08-24 | **D-075** When the linked video is a different cut from the timings, sync is withheld and the bar says so, instead of scrolling to the wrong line |
| 2026-08-24 | **D-074** Stanzas fade with distance rather than switching — three measured steps, none below the readability floor the reference itself ignores |
| 2026-08-24 | **D-073** A tool for growing the catalogue: 22 of 32 cells hold fewer than three tracks, and no ranking change fixes that — it proposes and classifies, but never writes the note or applies anything |
| 2026-08-24 | **D-072** Shelves rotate per visit rather than per day, remember what has been read, and can be re-rolled — 3 distinct tracks became 4–23 depending on how specific the answers were |
| 2026-08-24 | **D-071** Search ranks by which recording an entry is, not just how it is tagged; a variant notice and a version switcher on the track page; six curated picks repointed at the original |
| 2026-08-24 | **D-070** Playback resolves for 27 of 30 tracks instead of 17 — the Genius query was sent raw while only the scoring was cleaned |
| 2026-08-24 | **D-069** Deep Dive cards reduced to artwork, title and artist; one shared section heading — rule, confident label, asymmetric space — on the landing and in the story drawer |
| 2026-08-24 | **D-068** Deep Dives: shared reasons said once above the row instead of on all three cards; song titles no longer clamped to fit; cards share a height and a baseline |
| 2026-08-24 | **D-067** Devtools no longer ship to production; fourteen touch targets raised to 44px; a filled chip's label measured 4.46:1 and fixed |
| 2026-08-24 | **D-066** Rufina, Domine and Cormorant Garamond trialled against the new design and declined — the first two ship no italic, the third under-sets the UI face by 19.6%; seven unused font packages removed |
| 2026-08-24 | **D-065** The direction carried into every surface: glass retired for a solid surface system, elevation inverted on the bright ground after two measured contrast failures, one filled control per view, grain scoped to the reading page |
| 2026-08-24 | **D-064** New direction: electric blue, Fraunces + Outfit, lime accent; reading canvas kept calm; session intro; one-tap escape from the stepper |
| 2026-08-24 | **D-063** The landing now says a reader can search or start from a mood, instead of only implying it |
| 2026-08-24 | **D-062** Focus follows route changes; slow actions announce themselves; systematic pass over 122 stack rules and 119 guidelines |
| 2026-08-23 | **D-061** Metric-matched font fallbacks end the load-time reflow; buttons finally show a pointer |
| 2026-08-23 | **D-060** Focus can no longer scroll under the fixed masthead or dock; the search field gains a real visible label |
| 2026-08-23 | **D-059** A persistent masthead replaces a home link that was hidden on mobile and never actually fixed; search and mood offered together on the landing |
| 2026-08-23 | **D-058** Lyric Card fixed in production builds; CJK card type measured at full width instead of overflowing; hero and lyrics agree on regional Han shapes |
| 2026-08-23 | **D-057** Twelve script faces added — Arabic, Tamil, Thai, Hebrew, CJK and more; Cyrillic and Greek were broken too; CJK chosen by language, not by glyph |
| 2026-08-23 | **D-056** Entry flow: continue reading, search empty state, taste chips in place of a full reset, a persistent way home |
| 2026-08-23 | **D-055** Player mounts on first paint instead of after 4s; media lookup split from artwork; empty and loading states separated |
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
