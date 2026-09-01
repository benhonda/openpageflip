import { fileURLToPath } from "node:url";

/**
 * Workspace packages resolve to each other's source under test, never to a stale `dist`.
 * Mirrors `paths` in tsconfig.base.json, which covers type-checking the same way.
 */
export const workspaceAlias = {
  "@openpageflip/core/styles.css": fileURLToPath(
    new URL("./packages/core/src/styles.css", import.meta.url),
  ),
  "@openpageflip/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
};
