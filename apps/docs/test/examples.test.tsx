import type { Book } from "@openpageflip/core";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

// Every file under src/examples is shown on the site verbatim and run live there. These tests
// make sure each one still works, so a broken demo fails the build instead of the reader.
const coreExamples = import.meta.glob<{ mount: (container: HTMLElement) => Book }>(
  "../src/examples/core/*.ts",
  { eager: true },
);
// An example's pages are `<name>.html` beside it when it has its own, else the shared pages.html,
// the same rule CoreExample.astro applies on the site.
const coreMarkup = import.meta.glob<string>("../src/examples/core/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
});
const pagesFor = (examplePath: string): string => {
  const html =
    coreMarkup[examplePath.replace(/\.ts$/, ".html")] ??
    coreMarkup["../src/examples/core/pages.html"];
  if (html === undefined) throw new Error("src/examples/core/pages.html is missing");
  return html;
};
const reactExamples = import.meta.glob<{ default: () => ReactElement }>(
  "../src/examples/react/*.tsx",
  { eager: true },
);

describe("core examples", () => {
  it("exist", () => {
    expect(Object.keys(coreExamples).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(coreExamples))("%s mounts, flips and cleans up", async (path, example) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = pagesFor(path);
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
