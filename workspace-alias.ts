import { fileURLToPath } from "node:url";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Workspace packages resolve to each other's source under Vite (tests and the docs site), never
 * to a stale `dist`. Mirrors `paths` in tsconfig.base.json, which covers type-checking the same way.
 * Exact matches only, so subpaths like `@openpageflip/core/package.json` still go through the
 * package's `exports`.
 */
export const workspaceAlias = [
  { find: /^@openpageflip\/core$/, replacement: here("./packages/core/src/index.ts") },
  {
    find: /^@openpageflip\/core\/styles\.css$/,
    replacement: here("./packages/core/src/styles.css"),
  },
  { find: /^@openpageflip\/react$/, replacement: here("./packages/react/src/index.ts") },
];
