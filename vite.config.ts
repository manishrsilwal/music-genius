import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	// Two packages must stay external on every path (OD-018, OD-027).
	//
	// @resvg/resvg-js ships a native .node binary. Vite's dependency optimiser
	// tries to parse it as JavaScript and dies ("stream did not contain valid
	// UTF-8"). See ARCHITECTURE.md D-009 — the cost of the native rasteriser.
	//
	// harfbuzzjs is satori's text shaper, an Emscripten module that reads
	// `__dirname` to locate hb.wasm beside itself. Bundled into ESM there is no
	// `__dirname`, so it threw at import and took every card render with it. A
	// shim would only move the failure: the value has to resolve to the
	// package's own directory or the .wasm is not found either.
	optimizeDeps: { exclude: ["@resvg/resvg-js", "harfbuzzjs"] },
	ssr: { external: ["@resvg/resvg-js", "harfbuzzjs"] },
	css: {
		preprocessorOptions: {
			scss: {
				// Lets partials be reached as `@use "styles/mixins"` from anywhere,
				// instead of counting ../../ hops. See ARCHITECTURE.md D-013.
				loadPaths: [fileURLToPath(new URL("./src", import.meta.url))],
			},
		},
	},
	plugins: [
		devtools(),
		nitro({
			rollupConfig: { external: [/^@sentry\//, /^@resvg\//, /^harfbuzzjs/] },
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
