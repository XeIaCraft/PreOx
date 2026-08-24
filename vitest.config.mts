import path from "node:path";
import { defineConfig } from "vitest/config";

// Covers pure logic only (FSRS scheduling, citation correction, PDF-quote
// matching, dedup) — no React/DOM rendering, so plain Node is enough and
// nothing here needs jsdom or Next.js's own build pipeline.
export default defineConfig({
  resolve: {
    alias: {
      // "server-only" is resolved by Next's webpack config, not a real
      // npm package — aliased to a no-op so modules that (correctly) import
      // it as a client-bundling guard can still be unit-tested under Node.
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
