import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  platform: "browser",
  // ESM for bundlers (left readable; their bundler minifies), IIFE minified for a CDN <script>
  // tag (window.OpenPageFlip).
  format: { esm: {}, iife: { minify: true } },
  globalName: "OpenPageFlip",
  dts: true,
  sourcemap: true,
  // The stylesheet is a plain file consumers import themselves; never injected at runtime.
  copy: [{ from: "src/styles.css", to: "dist" }],
  publint: true,
  // ESM-only package: CJS and legacy node10 resolution are out of scope, and the CSS
  // subpath is not a TypeScript entrypoint.
  attw: { profile: "esm-only", level: "error", excludeEntrypoints: [/\.css$/] },
});
