import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:email": new URL(
        "./tests/cloudflare-email-stub.ts",
        import.meta.url
      ).pathname
    }
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      thresholds: {
        statements: 85,
        functions: 85,
        lines: 85
      }
    }
  }
});
