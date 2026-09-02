import { defineConfig } from "vitest/config";

// Each package owns its own vitest.config.ts; this root file only lists them.
export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "packages/react/vitest.node.config.ts",
      "apps/docs",
      "apps/docs/vitest.node.config.ts",
    ],
  },
});
