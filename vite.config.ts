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
			// The documents must say how to cache them (D-087). They said
			// nothing, so every layer guessed: a browser or proxy that kept a
			// copy of the HTML kept its references to hashed asset files —
			// files a rebuild deletes — and the page came back broken until a
			// hard refresh. `no-cache` means store-but-revalidate; with no
			// validators on the SSR stream that is a refetch of a few
			// kilobytes, which is the price of never serving last week's shell.
			//
			// Scoped to the two document routes, NOT `/**` — measured, a
			// routeRules header OVERRIDES a handler's own Cache-Control in
			// this Nitro, so a blanket rule silently flattened every /api
			// policy (no-store on card, immutable on og) to no-cache. The
			// assets rule restates Nitro's default so nothing can erode the
			// one cache that SHOULD be eternal: hashed filenames are their
			// own version stamp.
			routeRules: {
				"/": { headers: { "cache-control": "no-cache" } },
				"/track/**": { headers: { "cache-control": "no-cache" } },
				"/assets/**": {
					headers: { "cache-control": "public, max-age=31536000, immutable" },
				},
			},
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
