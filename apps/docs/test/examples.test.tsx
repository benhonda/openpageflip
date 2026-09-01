import type { Book } from "@openpageflip/core";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import pagesHtml from "../src/examples/core/pages.html?raw";

// Every file under src/examples is shown on the site verbatim and run live there. These tests
// make sure each one still works, so a broken demo fails the build instead of the reader.
const coreExamples = import.meta.glob<{ mount: (container: HTMLElement) => Book }>(
  "../src/examples/core/*.ts",
  { eager: true },
);
const reactExamples = import.meta.glob<{ default: () => ReactElement }>(
  "../src/examples/react/*.tsx",
  { eager: true },
);

describe("core examples", () => {
  it("exist", () => {
    expect(Object.keys(coreExamples).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(coreExamples))("%s mounts, flips and cleans up", async (_, example) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = pagesHtml;
    document.body.append(wrapper);
    const container = wrapper.querySelector<HTMLElement>("#book");
    if (container === null) throw new Error("pages.html must wrap the pages in #book");
    const pageCount = container.children.length;

    const book = example.mount(container);
    expect(book.pageCount).toBe(pageCount);
    expect(book.page).toBe(0);
    expect(await book.flipNext()).toBe(true);
    expect(book.page).toBeGreaterThan(0);

    book.destroy();
    expect(container.children.length).toBe(pageCount);
    wrapper.remove();
  });
});

describe("react examples", () => {
  it("exist", () => {
    expect(Object.keys(reactExamples).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(reactExamples))("%s renders its pages", async (_, example) => {
    const Example = example.default;
    const screen = await render(<Example />);
    await expect
      .poll(() => screen.container.querySelectorAll("[data-opf-page]").length)
      .toBeGreaterThan(1);
    await screen.unmount();
  });
});
