/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// pdfjs-dist は worker を別チャンクとして読み込むため、
// ESM worker を許可する設定にしている。
export default defineConfig({
  plugins: [react()],
  base: "./",
  worker: {
    format: "es",
  },
  optimizeDeps: {
    include: ["pdfjs-dist"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
