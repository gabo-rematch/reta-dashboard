/// <reference types="vitest" />

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const WORKER_ORIGIN = "https://reta-worker.gabriel-6f6.workers.dev";

export default defineConfig({
  define: { "import.meta.env.VITE_WORKER_ORIGIN": JSON.stringify(WORKER_ORIGIN) },
  base: "/reta-dashboard/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    exclude: ["node_modules/**", "dist/**", "worker/**"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: [
        "src/App.tsx",
        "src/lib/crypto.ts",
        "src/lib/push.ts",
        "src/lib/state.ts",
        "src/lib/symptom.ts"
      ],
      thresholds: {
        "src/lib/crypto.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        "src/lib/state.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        "src/lib/push.ts": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80
        },
        "src/lib/symptom.ts": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80
        }
      }
    }
  }
});
