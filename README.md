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

## Commands

```bash
bun install
bun run dev              # http://localhost:3000
bun run build            # production build → .output/
bun run check            # Biome lint + format
bun run test             # unit tests (vitest)
bunx tsc --noEmit        # typecheck
bun run generate-routes  # regenerate routeTree.gen.ts
```

## Conventions

- **No magic numbers in components.** Motion values come from `src/lib/motion.ts`;
  design values from the `@theme` layer in `src/styles.css`.
- **No faux font synthesis.** Rufina ships no italic — never synthesize one.
- **Secrets are server-only.** No API key may reach the client bundle.
- Cache TTLs are explicit and documented at the call site.

## Structure

Feature-first — routes stay thin, each feature in `src/features/` owns its own
components and hooks. See ARCHITECTURE.md §3.
