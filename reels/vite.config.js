
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],

  base: "/retro-radio/reels/",

  publicDir: false,

  build: {
    outDir: "../dist/reels",
    emptyOutDir: false,
  },

  closeBundle() {
    const source = resolve(__dirname, "../public");
    const destination = resolve(__dirname, "../dist/reels");

    if (existsSync(source)) {
      mkdirSync(destination, { recursive: true });

      for (const file of [
        "favicon.png",
        "radio-wave-icon.png",
        "og-preview.png",
      ]) {
        const sourceFile = resolve(source, file);

        if (existsSync(sourceFile)) {
          cpSync(sourceFile, resolve(destination, file));
          console.log(`Copied ${file} to Reels build`);
        }
      }
    }
  },
});
