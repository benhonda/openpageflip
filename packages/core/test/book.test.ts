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

test("a Book exposes state through getters, not snapshots", () => {
  const { book } = mount();
  const snapshot: Book = book;
  book.turnNext();
  expect(snapshot.page).toBe(2);
});
