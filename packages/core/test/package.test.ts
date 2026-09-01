import { expect, test } from "vitest";
import "../src/styles.css";
import { Direction, Layout } from "../src/index.ts";

// The suite runs in a real browser (never jsdom) and the shipped stylesheet applies as written.
test("runs in a real browser, not jsdom", () => {
  expect(navigator.userAgent).toContain("Chrome");
  expect(typeof document.body.getBoundingClientRect).toBe("function");
});

test("stylesheet applies to the host element", () => {
  const host = document.createElement("div");
  host.className = "opf-book";
  document.body.append(host);
  expect(getComputedStyle(host).touchAction).toBe("pan-y");
  expect(getComputedStyle(host).perspective).toBe("2000px");
  host.remove();
});

test("option vocabularies are closed string sets", () => {
  expect(Object.values(Layout)).toEqual(["auto", "single", "spread"]);
  expect(Object.values(Direction)).toEqual(["ltr", "rtl"]);
});
