# Typographic Lyrical Explorer

Lyrics as a premium editorial reading experience — synced to audio, annotated with
AI-synthesized context, and beautifully set.

> **Architecture decisions live in [doc/ARCHITECTURE.md](./doc/ARCHITECTURE.md);
> design conventions in [doc/DESIGN.md](./doc/DESIGN.md).**
> Nothing is decided by assumption; open questions are tracked there as
> *Deferred Decisions* until explicitly ruled on.

## Stack

| Layer | Choice |
|---|---|
| Framework | TanStack Start (Vite 8, React 19, SSR) |
| Routing | TanStack Router — file-based, type-safe |
| Data | Router loaders (SSR) + TanStack Query (deferred insights) |
| Styling | Tailwind CSS v4 — CSS-first `@theme` tokens |
| Motion | `motion` v13 |
| Type | Rufina (display) · Elms Sans (UI) — self-hosted |
| Toolchain | Biome · bun · Nitro |

| External service | Role | Required? |
|---|---|---|
| [LRCLIB](https://lrclib.net) | lyrics, synced timings, search | no key, no auth |
| Genius | album art, metadata, the YouTube id used for playback | optional |
| DeepSeek | the insights drawer — synthesis, quote, personal note | optional |
| Gemini | fallback writer, used only when DeepSeek returns nothing | optional |
| Tavily | web grounding; without it there is no quote, by design | optional |
| Upstash Redis | shared cache; falls back to per-process memory | strongly advised |

`SITE_URL` is configuration rather than a service: set it to the deployment's
public origin so shared track links carry an absolute `og:image` and preview as
a lyric card. Everything else works without it.

## Commands

```bash
bun install
bun run dev              # http://localhost:3000
bun run build            # production build → .output/
bun run check            # Biome lint + format
bun run test             # unit tests (vitest)
bun run typecheck        # tsc --noEmit
bun run verify           # typecheck + check + test + build — run before pushing
bun run generate-routes  # regenerate routeTree.gen.ts
```

## Configuration

```bash
cp .env.example .env     # then fill in what you have
```

**Every key is optional, and the app is built to run without any of them.** It
degrades to the features it can actually serve rather than failing: with no
`SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` album art falls back to Genius,
with no `GENIUS_ACCESS_TOKEN` there is no playback and no artwork fallback,
and lyrics and search work exactly as before. `src/server/env.ts` is the only module that
reads `process.env`, and it exposes a `features` object that the rest of the
code asks instead of testing for keys itself.

`.env` is gitignored and must never be committed. `.env.example` documents
every variable, where to get it, and what is lost without it.

> Insights need **either** `DEEPSEEK_API_KEY` **or** `GEMINI_API_KEY`. DeepSeek
> is primary and Gemini the fallback; with neither, the "Discover the Story"
> affordance simply never appears. See ARCHITECTURE.md D-050.

## Conventions

- **No magic numbers in components.** Motion values come from `src/lib/motion.ts`;
  design values from the `@theme` layer in `src/styles.css`.
- **No faux font synthesis.** Rufina ships no italic — never synthesize one.
- **Secrets are server-only.** No API key may reach the client bundle — only
  `*.server.ts` and server functions may read `env`, never a loader.
- **Model output is never trusted.** Quotes are checked verbatim against the
  source they cite, and quoted lyrics against the track's own words, in code
  rather than in the prompt.
- Cache TTLs are explicit and documented at the call site, and a change to how
  data is parsed bumps the key that stores it in the same commit.

## Structure

Feature-first — routes stay thin, each feature in `src/features/` owns its own
components, hooks and Sass. Server-only logic lives in `src/server/`, with the
insight providers behind a shared core that owns the prompt and every output
gate, so an adapter chooses only how it talks to a model.

See [ARCHITECTURE.md §3](./doc/ARCHITECTURE.md#3-project-structure) for the
annotated tree.
