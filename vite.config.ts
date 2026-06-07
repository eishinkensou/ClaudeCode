/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// フロントの /api 呼び出しを Express サーバ（8787）へプロキシする。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // AI解析は数分かかることがあるため、プロキシのタイムアウトを長めに
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
        timeout: 600000,
        proxyTimeout: 600000,
      },
    },
  },
  worker: { format: "es" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
