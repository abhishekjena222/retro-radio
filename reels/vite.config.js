
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/retro-radio/reels/",

  // Use the main project's public folder
  publicDir: "../public",

  build: {
    outDir: "../dist/reels",
    emptyOutDir: false,
  },
});
