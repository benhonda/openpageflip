import { expect, test } from "vitest";
import "../src/styles.css";

// The shipped stylesheet applies as written in a real browser.
test("stylesheet applies to the host element", () => {
  const host = document.createElement("div");
  host.className = "opf-book";
  document.body.append(host);
  expect(getComputedStyle(host).touchAction).toBe("pan-y");
  expect(getComputedStyle(host).perspective).toBe("2000px");
  host.remove();
});
