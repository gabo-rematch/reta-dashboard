/// <reference types="vitest" />

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/reta-dashboard/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/App.tsx", "src/lib/crypto.ts", "src/lib/state.ts"],
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
        }
      }
    }
  }
});
