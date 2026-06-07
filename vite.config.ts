/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// フロントの /api 呼び出しを Express サーバ（8787）へプロキシする。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  worker: { format: "es" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
