import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	// @resvg/resvg-js ships a native .node binary. Vite's dependency optimiser
	// tries to parse it as JavaScript and dies ("stream did not contain valid
	// UTF-8"), so it must stay external on every path. See ARCHITECTURE.md D-009
	// — this is precisely the cost of the native rasteriser.
	optimizeDeps: { exclude: ["@resvg/resvg-js"] },
	ssr: { external: ["@resvg/resvg-js"] },
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
		nitro({ rollupConfig: { external: [/^@sentry\//, /^@resvg\//] } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
