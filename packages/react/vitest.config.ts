import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { workspaceAlias } from "../../vitest.workspace-alias.ts";

// Real-browser tests: the component drives real layout and pointer events.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: workspaceAlias },
  test: {
    name: "@openpageflip/react",
    include: ["test/**/*.test.tsx"],
    exclude: ["**/*.ssr.test.tsx", "**/node_modules/**"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      viewport: { width: 1000, height: 700 },
    },
  },
});
