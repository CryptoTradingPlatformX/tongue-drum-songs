import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages project site: https://<user>.github.io/tongue-drum-songs/
export default defineConfig({
  base: "/tongue-drum-songs/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
