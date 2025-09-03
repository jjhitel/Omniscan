// vite.config.js
import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";
import path from "path";
import { fileURLToPath } from 'url';

// Helper to get the project root directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Determine the target browser from the environment variable
const target = process.env.TARGET || "chrome";

// Resolve the absolute path to the correct manifest file
const manifestPath = path.resolve(__dirname, "src", `manifest.${target}.json`);

export default defineConfig({
    plugins: [
        webExtension({
            // Provide the resolved, absolute path to the manifest directly
            manifest: manifestPath,
            // The ZIP configuration has been removed from here
        }),
    ],
    build: {
        // Define target-specific output directories (e.g., dist/chrome)
        outDir: path.resolve(__dirname, "dist", target),
        emptyOutDir: true,
    },
});
