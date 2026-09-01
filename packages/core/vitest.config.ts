import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Real-browser tests only: this library is layout, pointer and rAF code that jsdom cannot run.
export default defineConfig({
  server: { watch: { ignored: ["**/__screenshots__/**"] } },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      viewport: { width: 1000, height: 700 },
      screenshotFailures: false,
    },
  },
});
