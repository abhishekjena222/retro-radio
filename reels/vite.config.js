import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/retro-radio/reels/",
  build: {
    outDir: "../dist/reels",
    emptyOutDir: false,
  },
});
