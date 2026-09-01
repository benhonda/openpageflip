import { expect, it } from "vitest";
import { resolveOptions } from "../src/options.ts";
import source from "../src/options.ts?raw";

/**
 * The `@default` tags on `BookOptions` are what editors and the generated reference show;
 * `DEFAULTS` is what runs. This keeps the two equal without a second copy anywhere.
 */
it("every optional BookOptions property documents the default that resolveOptions applies", () => {
  const defaults = resolveOptions({ width: 1, height: 1 });
  for (const [name, value] of Object.entries(defaults)) {
    if (name === "width" || name === "height") continue; // required, no default
    // The comment right before the property: everything from a `/**` that contains no `*/`.
    const doc = source.match(
      new RegExp(String.raw`/\*\*((?:(?!\*/)[^])*)\*/\s*readonly ${name}\?:`),
    )?.[1];
    expect(doc, `${name} has a TSDoc comment`).toBeDefined();
    const tag = doc?.match(/@default (.+?)\s*$/m)?.[1];
    expect(tag, `${name} has an @default tag`).toBeDefined();
    if (typeof value === "function") continue; // described in words ("linear"), not code
    expect(tag, `@default of ${name}`).toBe(JSON.stringify(value));
  }
});
