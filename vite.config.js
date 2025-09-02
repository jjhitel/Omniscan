// vite.config.js
import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
    plugins: [
        webExtension({
            manifest: "src/manifest.json",
            outputDir: ".",
        }),
    ],
    build: {
        outDir: "dist", // The directory for the unpacked extension
    },
});
