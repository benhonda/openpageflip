import { afterEach, describe, expect, test } from "vitest";
import { type Book, createBook, FlipState, Orientation } from "../src/index.ts";
import "../src/styles.css";

function stage(
  width: number,
  pageCount = 6,
): { stage: HTMLElement; container: HTMLElement; pages: HTMLElement[] } {
  const el = document.createElement("div");
  el.style.cssText = `width: ${width}px;`;
  const container = document.createElement("div");
  container.id = "book";
  const pages = Array.from({ length: pageCount }, (_, i) => {
    const page = document.createElement("div");
    page.className = "my-page";
    page.style.cssText = "background: pink;";
    page.textContent = `Page ${i + 1}`;
    return page;
  });
  container.append(...pages);
  el.append(container);
  document.body.append(el);
  return { stage: el, container, pages };
}

const frames = (n: number): Promise<void> =>
  new Promise((resolve) => {
    let left = n;
    const step = (): void => (--left <= 0 ? resolve() : void requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

function pointer(
  target: Element,
  type: string,
  x: number,
  y: number,
  extra: PointerEventInit = {},
): void {
  const bounds = (target.closest("#book") ?? target).getBoundingClientRect();
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: bounds.left + x,
      clientY: bounds.top + y,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1,
      bubbles: true,
      cancelable: true,
      ...extra,
    }),
  );
}

let cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup) fn();
  cleanup = [];
});

function mount(
  width = 500,
  options: Parameters<typeof createBook>[1] = { width: 250, height: 350 },
) {
  const s = stage(width);
  const book = createBook(s.container, options);
  cleanup.push(() => {
    book.destroy();
    s.stage.remove();
  });
  return { ...s, book };
}

describe("createBook", () => {
  test("rejects options that cannot make a book, with a readable message", () => {
    const { container } = stage(500);
    cleanup.push(() => container.parentElement?.remove());
    expect(() => createBook(container, { width: 0, height: 350 })).toThrow(
      /"width" must be a positive number/,
    );
    expect(() =>
      createBook(container, { width: 250, height: 350, layout: "sideways" as never }),
    ).toThrow(/unknown "layout"/);
    expect(() => createBook(container, { width: 250, height: 350, startPage: 9 })).toThrow(
      /out of range/,
    );
    expect(() => createBook(container, { width: 250, height: 350, ignoreDragOn: "a[" })).toThrow(
      /not a valid selector/,
    );
  });

  test("lays out the container's children as pages and sizes the container", () => {
    const { book, container, pages } = mount();
    expect(container.classList.contains("opf-book")).toBe(true);
    expect(container.querySelectorAll(".opf-shadow")).toHaveLength(4);
    expect(pages.every((p) => p.classList.contains("opf-page"))).toBe(true);
    expect(book.pageCount).toBe(6);
    expect(book.orientation).toBe(Orientation.landscape);
    expect(container.getBoundingClientRect()).toMatchObject({ width: 500, height: 350 });
    expect(book.rect).toEqual({ left: 0, top: 0, width: 500, height: 350, pageWidth: 250 });
    expect(getComputedStyle(pages[0] as HTMLElement).display).toBe("block");
    expect(getComputedStyle(pages[2] as HTMLElement).display).toBe("none");
  });

  test("init fires after createBook returns, so listeners attached afterwards hear it", async () => {
    const { book } = mount();
    const seen: unknown[] = [];
    book.on("init", (e) => seen.push(e));
    await Promise.resolve();
    expect(seen).toEqual([{ page: 0, orientation: "landscape" }]);
  });

  test("destroy restores the pages and the container exactly", () => {
    const { book, container, pages } = mount();
    book.destroy();
    expect(container.className).toBe("");
    expect(container.getAttribute("style")).toBe("");
    expect(container.querySelectorAll(".opf-shadow")).toHaveLength(0);
    for (const page of pages) {
      expect(page.className).toBe("my-page");
      expect(page.getAttribute("style")).toBe("background: pink;");
    }
  });

  test("narrowing the container switches to portrait and says so", async () => {
    const { book, stage: el } = mount();
    const orientations: Orientation[] = [];
    book.on("changeOrientation", (e) => orientations.push(e.orientation));
    el.style.width = "300px";
    await frames(3);
    expect(book.orientation).toBe(Orientation.portrait);
    expect(orientations).toEqual([Orientation.portrait]);
    expect(book.rect.left).toBe(-225);
  });

  test("a click on a link inside a page is left to the link", () => {
    const { book, pages } = mount();
    const link = document.createElement("a");
    link.href = "#somewhere";
    link.textContent = "go";
    link.style.cssText = "position: absolute; right: 4px; top: 4px;";
    pages[1]?.append(link);
    pointer(link, "pointerdown", 490, 10);
    pointer(link, "pointerup", 490, 10);
    expect(book.state).toBe(FlipState.read);
  });

  test("a click on the page turns it", async () => {
    const { book, container } = mount(500, { width: 250, height: 350, flipDuration: 40 });
    const flips: number[] = [];
    book.on("flip", (e) => flips.push(e.page));
    pointer(container, "pointerdown", 470, 40);
    pointer(container, "pointerup", 470, 40);
    expect(book.state).toBe(FlipState.flipping);
    await new Promise((r) => setTimeout(r, 200));
    expect(book.page).toBe(2);
    expect(flips).toEqual([2]);
    expect(book.state).toBe(FlipState.read);
  });

  test("a quick horizontal swipe turns the page", async () => {
    const { book, container } = mount(500, { width: 250, height: 350, flipDuration: 40 });
    pointer(container, "pointerdown", 400, 100);
    pointer(container, "pointermove", 300, 100);
    pointer(container, "pointerup", 300, 100);
    await new Promise((r) => setTimeout(r, 200));
    expect(book.page).toBe(2);
  });

  test("pointercancel drops a lifted corner without turning", async () => {
    const { book, container } = mount(500, { width: 250, height: 350, flipDuration: 40 });
    pointer(container, "pointerdown", 470, 40);
    pointer(container, "pointermove", 330, 120);
    expect(book.state).toBe(FlipState.userFold);
    pointer(container, "pointercancel", 330, 120);
    await new Promise((r) => setTimeout(r, 200));
    expect(book.page).toBe(0);
    expect(book.state).toBe(FlipState.read);
  });

  test("a page keeps its own inline style through a flip and back", async () => {
    const { book, container, pages } = mount(500, { width: 250, height: 350, flipDuration: 40 });
    pointer(container, "pointerdown", 470, 40);
    pointer(container, "pointermove", 330, 120);
    expect(pages[0]?.style.background).toBe("pink");
    expect(pages[2]?.style.background).toBe("pink");
    pointer(container, "pointerup", 330, 120);
    await new Promise((r) => setTimeout(r, 200));
    expect(book.page).toBe(0);
    expect(pages.every((p) => p.style.background === "pink")).toBe(true);
  });

  test("setPages swaps the pages and keeps the current page in range", () => {
    const { book, container, pages } = mount();
    book.turnTo(4);
    const fresh = [document.createElement("div"), document.createElement("div")];
    const updates: unknown[] = [];
    book.on("update", (e) => updates.push(e));
    book.setPages(fresh);
    expect(book.pageCount).toBe(2);
    expect(book.page).toBe(0);
    expect(updates).toEqual([{ page: 0, orientation: "landscape" }]);
    expect(
      fresh.every((p) => p.parentElement === container && p.classList.contains("opf-page")),
    ).toBe(true);
    expect(pages[0]?.className).toBe("my-page");
  });

  test("flipNext resolves when the turn lands", async () => {
    const { book } = mount(500, { width: 250, height: 350, flipDuration: 40 });
    expect(await book.flipNext()).toBe(true);
    expect(book.page).toBe(2);
    expect(await book.flipPrev("bottom")).toBe(true);
    expect(book.page).toBe(0);
    expect(await book.flipPrev()).toBe(false);
  });
});

describe("options that switch behaviour off or change the layout", () => {
  test("swipe: false leaves a quick horizontal swipe alone", async () => {
    const { book, container } = mount(500, {
      width: 250,
      height: 350,
      flipDuration: 40,
      swipe: false,
    });
    pointer(container, "pointerdown", 400, 100);
    pointer(container, "pointermove", 300, 100);
    pointer(container, "pointerup", 300, 100);
    await new Promise((r) => setTimeout(r, 120));
    expect(book.page).toBe(0);
  });

  test("hoverCorners: false never lifts a corner on hover", () => {
    const { book, container } = mount(500, { width: 250, height: 350, hoverCorners: false });
    pointer(container, "pointermove", 470, 30, { buttons: 0, button: -1 });
    expect(book.state).toBe(FlipState.read);
  });

  test("click: 'off' ignores clicks but still allows a drag", async () => {
    const { book, container } = mount(500, {
      width: 250,
      height: 350,
      flipDuration: 40,
      click: "off",
    });
    pointer(container, "pointerdown", 470, 40);
    pointer(container, "pointerup", 470, 40);
    expect(book.state).toBe(FlipState.read);
    pointer(container, "pointerdown", 470, 40);
    pointer(container, "pointermove", 100, 90);
    expect(book.state).toBe(FlipState.userFold);
    pointer(container, "pointerup", 100, 90);
    await new Promise((r) => setTimeout(r, 200));
    expect(book.page).toBe(2);
  });

  test("ignoreDragOn takes a custom selector, and false turns it off", async () => {
    const custom = mount(500, { width: 250, height: 350, flipDuration: 40, ignoreDragOn: ".keep" });
    const keep = document.createElement("span");
    keep.className = "keep";
    keep.style.cssText = "position: absolute; right: 4px; top: 4px;";
    custom.pages[1]?.append(keep);
    pointer(keep, "pointerdown", 490, 10);
    pointer(keep, "pointerup", 490, 10);
    expect(custom.book.state).toBe(FlipState.read);

    const off = mount(500, { width: 250, height: 350, flipDuration: 40, ignoreDragOn: false });
    const link = document.createElement("a");
    link.href = "#x";
    link.style.cssText = "position: absolute; right: 4px; top: 4px;";
    off.pages[1]?.append(link);
    pointer(link, "pointerdown", 490, 10);
    pointer(link, "pointerup", 490, 10);
    expect(off.book.state).toBe(FlipState.flipping);
  });

  test("layout: 'single' shows one page in a wide container; 'spread' shows two in a narrow one", () => {
    const single = mount(500, { width: 250, height: 350, layout: "single" });
    expect(single.book.orientation).toBe(Orientation.portrait);
    expect(single.container.getBoundingClientRect().width).toBe(250);
    const spread = mount(300, { width: 250, height: 350, layout: "spread" });
    expect(spread.book.orientation).toBe(Orientation.landscape);
    expect(spread.container.getBoundingClientRect().width).toBe(500);
  });

  test("size: 'stretch' fills the container and keeps the page ratio", () => {
    const { book, container } = mount(700, {
      width: 250,
      height: 350,
      size: "stretch",
      maxWidth: 400,
    });
    expect(container.getBoundingClientRect().width).toBe(700);
    expect(book.rect.pageWidth).toBe(350);
    expect(book.rect.height).toBe(490);
  });

  test("autoSize: false leaves the container's size to its own CSS", () => {
    const { container } = mount(500, { width: 250, height: 350, autoSize: false });
    expect(container.style.width).toBe("");
    expect(container.style.aspectRatio).toBe("");
  });

  test("shadows: false draws no shadow during a drag", () => {
    const { container } = mount(500, { width: 250, height: 350, shadows: false });
    pointer(container, "pointerdown", 470, 40);
    pointer(container, "pointermove", 330, 120);
    const visible = Array.from(container.querySelectorAll<HTMLElement>(".opf-shadow")).filter(
      (el) => el.style.display !== "none",
    );
    expect(visible).toHaveLength(0);
  });

  test("a hard page's shadow is drawn only where a page is there to receive it", () => {
    const shadows = (container: HTMLElement): string[] =>
      Array.from(container.querySelectorAll<HTMLElement>(".opf-shadow"))
        .filter((el) => el.style.display !== "none")
        .map((el) => el.className.replace(/.*--/, ""));

    // A cover opens onto the empty left side: no shadow lands there, before or past the spine.
    const cover = mount(500, { width: 250, height: 350, cover: true });
    pointer(cover.container, "pointerdown", 470, 40);
    pointer(cover.container, "pointermove", 330, 100);
    expect(shadows(cover.container)).toEqual(["hard-outer"]);
    pointer(cover.container, "pointermove", 150, 100);
    expect(shadows(cover.container)).toEqual(["hard-inner"]);
    pointer(cover.container, "pointercancel", 150, 100);

    // The lone last page closes onto the empty right side, likewise.
    const last = mount(500, { width: 250, height: 350, cover: true, startPage: 5 });
    pointer(last.container, "pointerdown", 30, 40);
    pointer(last.container, "pointermove", 180, 100);
    expect(shadows(last.container)).toEqual(["hard-outer"]);
    pointer(last.container, "pointermove", 350, 100);
    expect(shadows(last.container)).toEqual(["hard-inner"]);
    pointer(last.container, "pointercancel", 350, 100);

    // A hard page in the middle of the book has a page on both sides: both shadows show.
    const middle = stage(500);
    middle.pages[3]?.setAttribute("data-density", "hard");
    const book = createBook(middle.container, { width: 250, height: 350, startPage: 2 });
    cleanup.push(() => {
      book.destroy();
      middle.stage.remove();
    });
    pointer(middle.container, "pointerdown", 470, 40);
    pointer(middle.container, "pointermove", 330, 100);
    expect(shadows(middle.container)).toEqual(["hard-outer", "hard-inner"]);
    pointer(middle.container, "pointermove", 150, 100);
    expect(shadows(middle.container)).toEqual(["hard-outer", "hard-inner"]);
  });

  test("easing shapes the corner's path", async () => {
    const seen: number[] = [];
    const { book } = mount(500, {
      width: 250,
      height: 350,
      flipDuration: 60,
      easing: (t) => {
        seen.push(t);
        return t * t;
      },
    });
    await book.flipNext();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((t) => t >= 0 && t < 1)).toBe(true);
  });

  test("off and an AbortSignal both stop a listener, even one attached with an aborted signal", () => {
    const { book } = mount();
    const calls: number[] = [];
    const listener = (e: { page: number }) => calls.push(e.page);
    book.on("flip", listener);
    book.off("flip", listener);
    const controller = new AbortController();
    book.on("flip", listener, { signal: controller.signal });
    controller.abort();
    book.on("flip", listener, { signal: AbortSignal.abort() });
    book.turnNext();
    expect(calls).toEqual([]);
  });

  test("redraw re-applies the book's classes after they were rewritten", () => {
    const { book, pages } = mount();
    const first = pages[0] as HTMLElement;
    first.className = "my-page";
    book.redraw();
    expect(first.classList.contains("opf-page")).toBe(true);
    expect(first.classList.contains("my-page")).toBe(true);
  });
});

test("a Book exposes state through getters, not snapshots", () => {
  const { book } = mount();
  const snapshot: Book = book;
  book.turnNext();
  expect(snapshot.page).toBe(2);
});
