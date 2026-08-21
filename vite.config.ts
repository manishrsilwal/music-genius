import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: { tsconfigPaths: true },
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
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
