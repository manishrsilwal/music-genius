import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Separate from vite.config.ts on purpose: the app config loads the Nitro and
 * TanStack Start plugins, which spin up a server environment the unit tests
 * have no use for.
 *
 * Scope is deliberate — the pure logic where bugs actually appeared during the
 * build: LRC parsing, metadata normalisation, card type sizing, and the
 * Genius match scorer. Each of these encodes a heuristic that was wrong at
 * least once.
 */
export default defineConfig({
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
