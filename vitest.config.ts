import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Separate from vite.config.ts on purpose: the app config loads the Nitro and
 * TanStack Start plugins, which spin up a server environment the unit tests
 * have no use for.
 *
 * Scope grew in two steps. First: the pure logic where bugs actually appeared
 * — LRC parsing, metadata normalisation, card type sizing, the Genius match
 * scorer — each a heuristic that was wrong at least once. Then D-077 added a
 * DOM environment for component tests (OD-020), scoped by extension so the
 * logic suite keeps its sub-second runtime.
 */
export default defineConfig({
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		/*
		 * Component tests run in a DOM, logic tests do not pay for one (D-077).
		 * The split is per-file: every .test.tsx opens with a
		 * `@vitest-environment happy-dom` pragma, everything else stays on
		 * node — so the 250 pure-logic tests keep their sub-second runtime.
		 * (`environmentMatchGlobs` was the config-level way to say this and
		 * vitest 4 removed it; the pragma is the mechanism that survives.)
		 */
		setupFiles: ["./src/test-setup.ts"],
	},
});
