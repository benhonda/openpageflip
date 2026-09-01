import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "src/index.ts",
  platform: "browser",
  format: "esm",
  dts: true,
  sourcemap: true,
  publint: true,
  attw: { profile: "esm-only", level: "error" },
});
