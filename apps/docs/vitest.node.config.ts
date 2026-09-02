import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { workspaceAlias } from "../../workspace-alias.ts";

// The Open Graph image is rendered by the build in Node, not in a browser, so it is tested there.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: workspaceAlias },
  test: {
    name: "@openpageflip/docs (node)",
    environment: "node",
    include: ["test/**/*.node.test.{ts,tsx}"],
  },
});
