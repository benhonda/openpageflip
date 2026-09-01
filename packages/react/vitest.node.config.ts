import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { workspaceAlias } from "../../workspace-alias.ts";

// Server rendering has no window: this project proves the package can be imported and rendered there.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: workspaceAlias },
  test: {
    name: "@openpageflip/react (ssr)",
    environment: "node",
    include: ["test/**/*.ssr.test.tsx"],
  },
});
