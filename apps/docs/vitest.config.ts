import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { workspaceAlias } from "../../workspace-alias.ts";

// Every docs example must mount and flip in a real browser: the demos are the docs.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: workspaceAlias },
  test: {
    name: "@openpageflip/docs",
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: ["**/*.node.test.ts", "**/node_modules/**"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      viewport: { width: 1000, height: 700 },
    },
  },
});
