import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { songIndexPlugin } from "./vite/songIndexPlugin";

// GitHub Pages project site: https://<user>.github.io/tongue-drum-songs/
export default defineConfig({
  base: "/tongue-drum-songs/",
  plugins: [react(), songIndexPlugin()],
  optimizeDeps: {
    exclude: ["virtual:song-index"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
