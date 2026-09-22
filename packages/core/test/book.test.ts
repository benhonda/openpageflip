import { afterEach, describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { type Book, createBook, FlipState, Orientation } from "../src/index.ts";
import "../src/styles.css";
import { frames, pointer, stage, touch } from "./dom.ts";

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

  test("a quick horizontal swipe from the middle of a page turns it", async () => {
    const { book, container } = mount(500, { width: 250, height: 350, flipDuration: 40 });
    pointer(container, "pointerdown", 400, 100, touch);
    pointer(container, "pointermove", 300, 100, touch);
    pointer(container, "pointerup", 300, 100, touch);
    await new Promise((r) => setTimeout(r, 200));
    expect(book.page).toBe(2);
  });

  test("the same quick drag with a mouse is not a swipe: it is left to text selection", async () => {
    const { book, container } = mount(500, { width: 250, height: 350, flipDuration: 40 });
    pointer(container, "pointerdown", 400, 100);
    pointer(container, "pointermove", 300, 100);
    pointer(container, "pointerup", 300, 100);
    await new Promise((r) => setTimeout(r, 200));
    expect(book.page).toBe(0);
    expect(book.state).toBe(FlipState.read);
  });

  test("a real mouse drag across the middle of a page selects its text; from the edge it folds the page", async () => {
    const { book, pages } = mount(500, { width: 250, height: 350, flipDuration: 40 });
    const word = (text: string, left: number, top: number): HTMLElement => {
      const span = document.createElement("span");
      span.textContent = text;
      span.style.cssText = `position: absolute; left: ${left}px; top: ${top}px;`;
      pages[1]?.append(span);
      return span;
    };
    // The right page spans container x 250..500; its edge strip starts at 414.
    const from = word("start", 60, 170);
    const to = word("end", 140, 170);
    await userEvent.dragAndDrop(from, to);
    expect(document.getSelection()?.toString().length).toBeGreaterThan(0);
    expect(book.page).toBe(0);
    expect(book.state).toBe(FlipState.read);

    document.getSelection()?.removeAllRanges();
    const edge = word("edge", 225, 30);
    await userEvent.dragAndDrop(edge, to);
    expect(document.getSelection()?.toString()).toBe("");
    await new Promise((r) => setTimeout(r, 200));
    expect(book.page).toBe(0);
    expect(book.state).toBe(FlipState.read);
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

  test("only the page in the air has an edge drawn, until it lands, and the host can recolour it", async () => {
    const { book, container, pages } = mount(500, { width: 250, height: 350, flipDuration: 40 });
    const edged = () =>
      pages.flatMap((p, i) => (getComputedStyle(p).outlineStyle === "none" ? [] : [i]));
    expect(edged()).toEqual([]);

    pointer(container, "pointerdown", 470, 40);
    pointer(container, "pointermove", 330, 120);
    // The third page is the back of the one being turned; the fourth, uncovered under it, has no edge.
    expect(edged()).toEqual([2]);
    expect(getComputedStyle(pages[2] as HTMLElement).outlineOffset).toBe("-1px");
    container.style.setProperty("--opf-page-edge", "rgb(255, 0, 0)");
    expect(getComputedStyle(pages[2] as HTMLElement).outlineColor).toBe("rgb(255, 0, 0)");

    pointer(container, "pointerup", 330, 120);
    await new Promise((r) => setTimeout(r, 200));
    expect(book.state).toBe(FlipState.read);
    expect(edged()).toEqual([]);
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

  test("a page's hard or soft class says what it is, all the way through a turn", async () => {
    // Page 1 is soft paper on the back of the hard cover, so closing the book swings it as a
    // board. Its class must not follow it there: page styling hangs off that class.
    const { book, pages } = mount(500, {
      width: 250,
      height: 350,
      cover: true,
      startPage: 1,
      flipDuration: 200,
    });
    const [cover, inside] = pages;
    if (!cover || !inside) throw new Error("the stage lost its pages");
    expect(inside.classList.contains("opf-page--soft")).toBe(true);

    let drawn = 0;
    let swungAsBoard = false;
    const wrong: string[] = [];
    book.on("flipProgress", () => {
      drawn++;
      swungAsBoard ||= inside.style.transform.includes("rotateY");
      if (
        !inside.classList.contains("opf-page--soft") ||
        inside.classList.contains("opf-page--hard")
      )
        wrong.push(`inside: ${inside.className}`);
      if (cover.classList.contains("opf-page--soft")) wrong.push(`cover: ${cover.className}`);
    });
    expect(await book.flipPrev()).toBe(true);

    expect(drawn).toBeGreaterThan(1);
    expect(swungAsBoard).toBe(true);
    expect(wrong).toEqual([]);
    expect(cover.classList.contains("opf-page--hard")).toBe(true);
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
    pointer(container, "pointerdown", 400, 100, touch);
    pointer(container, "pointermove", 300, 100, touch);
    pointer(container, "pointerup", 300, 100, touch);
    await new Promise((r) => setTimeout(r, 120));
    expect(book.page).toBe(0);
  });

  test("hover: false never furls an edge on hover", () => {
    const { book, container } = mount(500, { width: 250, height: 350, hover: false });
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

    // The cover closes away from the left side and leaves it empty: the same, the other way round.
    const closing = mount(500, { width: 250, height: 350, cover: true, startPage: 1 });
    pointer(closing.container, "pointerdown", 30, 40);
    pointer(closing.container, "pointermove", 180, 100);
    expect(shadows(closing.container)).toEqual(["hard-inner"]);
    pointer(closing.container, "pointermove", 350, 100);
    expect(shadows(closing.container)).toEqual(["hard-outer"]);
    pointer(closing.container, "pointercancel", 350, 100);

    // And the turn onto the lone last page leaves the right side empty.
    const ending = mount(500, { width: 250, height: 350, cover: true, startPage: 3 });
    pointer(ending.container, "pointerdown", 470, 40);
    pointer(ending.container, "pointermove", 330, 100);
    expect(shadows(ending.container)).toEqual(["hard-inner"]);
    pointer(ending.container, "pointermove", 150, 100);
    expect(shadows(ending.container)).toEqual(["hard-outer"]);
    pointer(ending.container, "pointercancel", 150, 100);

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

  test("in a single-page book a hard cover is drawn once, lifting, so it stays on show under a hover", async () => {
    const { container, pages } = mount(300, { width: 300, height: 420, cover: true });
    pointer(container, "pointermove", 285, 400, { buttons: 0 });
    await frames(40);
    // Lifted a little off the page, toward the reader. Drawn a second time as the far face of a
    // spread's sheet, which a single page does not have, it turned face down and vanished.
    const turned = /rotateY\(([-\d.]+)deg\)/.exec(pages[0]?.style.transform ?? "")?.[1];
    expect(Number(turned)).toBeGreaterThan(270);
    expect(Number(turned)).toBeLessThan(360);
    const bounds = container.getBoundingClientRect();
    expect(document.elementFromPoint(bounds.left + 150, bounds.top + 200)).toBe(pages[0]);
  });

  test("a single-page book's page coming back uncurls over the page on show, never beside the book", async () => {
    const s = stage(900);
    s.container.style.marginLeft = "300px";
    const book = createBook(s.container, {
      width: 300,
      height: 420,
      layout: "single",
      startPage: 2,
    });
    cleanup.push(() => {
      book.destroy();
      s.stage.remove();
    });
    const bounds = s.container.getBoundingClientRect();
    const at = (x: number): Element | null =>
      document.elementFromPoint(bounds.left + x, bounds.top + 200);
    const clone = (): Element | null => s.container.querySelector("[data-opf-clone]");
    // The hover cue: the page coming back, curled over itself, in a strip along the spine.
    pointer(s.container, "pointermove", 15, 400, { buttons: 0 });
    await frames(40);
    // The curl is an inert copy, which hit testing passes through to the page itself beneath it.
    expect(clone()).not.toBeNull();
    expect(at(15)).toBe(s.pages[1]);
    expect(at(60)).toBe(s.pages[2]);
    expect(s.container.contains(at(-60))).toBe(false);
    // Taken in hand and pulled past the middle: laid down behind its crease, still all on the page.
    pointer(s.container, "pointerdown", 15, 400);
    pointer(s.container, "pointermove", 215, 400);
    expect(at(60)).toBe(s.pages[1]);
    expect(at(280)).toBe(s.pages[2]);
    expect(s.container.contains(at(-60))).toBe(false);
    pointer(s.container, "pointercancel", 215, 400);
  });

  test("in a single-page book a hard page casts one shadow, darkest at the spine and fading outward", async () => {
    const s = stage(900);
    s.container.style.marginLeft = "300px";
    const cover = s.pages[0];
    if (cover !== undefined) cover.dataset["density"] = "hard";
    const book = createBook(s.container, {
      width: 300,
      height: 420,
      layout: "single",
      startPage: 1,
    });
    cleanup.push(() => {
      book.destroy();
      s.stage.remove();
    });
    pointer(s.container, "pointermove", 15, 100, { buttons: 0 });
    await frames(40);
    const shown = Array.from(s.container.querySelectorAll<HTMLElement>(".opf-shadow")).filter(
      (el) => el.style.display !== "none",
    );
    // Not the landscape pair: one gradient from the spine (the container's left edge here), dark
    // end first, so nothing darkens toward a cut-off far edge.
    expect(shown.map((el) => el.className.replace(/.*--/, ""))).toEqual(["hard-outer"]);
    const shadow = shown[0];
    expect(shadow?.getBoundingClientRect().left).toBeCloseTo(
      s.container.getBoundingClientRect().left,
      0,
    );
    expect(shadow?.style.background).toMatch(
      /to right, rgba\(0, 0, 0, 0\.[1-9]\d*\).*rgba\(0, 0, 0, 0\)\)/,
    );
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

/**
 * A host may scale the book (a zoom) or give it a border. Neither changes its layout, so the same
 * gesture on the page has to draw the same frame as it does on a plain book.
 */
describe("a book the host has scaled or bordered", () => {
  const options = { width: 250, height: 350, flipDuration: 40 } as const;
  /** `wrap` styles the stage, `box` the container; `sx, sy, inset` are what they do to a pointer. */
  const hosts = [
    { name: "transform: scale(2)", wrap: "transform: scale(2); transform-origin: 0 0;", sx: 2 },
    { name: "a scale around the centre", wrap: "transform: scale(0.5);", sx: 0.5 },
    { name: "an uneven scale", wrap: "transform: scale(1.5, 0.75);", sx: 1.5, sy: 0.75 },
    { name: "zoom: 2", wrap: "zoom: 2;", sx: 2 },
    { name: "a border", box: "border: 12px solid;", sx: 1, inset: 12 },
    {
      name: "a border under a scale",
      wrap: "transform: scale(2);",
      box: "border: 12px solid;",
      sx: 2,
      inset: 12,
    },
  ];

  /** From the outer edge to mid-page. A top- or bottom-bound book is one page wide and two tall. */
  const drags = {
    left: [
      [495, 40],
      [250, 120],
    ],
    right: [
      [5, 40],
      [250, 120],
    ],
    top: [
      [40, 695],
      [120, 350],
    ],
    bottom: [
      [40, 5],
      [120, 350],
    ],
  } as const;

  /**
   * A drag held mid-fold, on a plain book and on the host's. It starts closer to the outer edge
   * than a border is wide, so a pointer measured from the border's outside misses the page.
   */
  function twins(host: (typeof hosts)[number], binding: keyof typeof drags) {
    const plain = mount(500, { ...options, binding });
    const hosted = mount(500, { ...options, binding });
    hosted.stage.style.cssText += host.wrap ?? "";
    hosted.container.style.cssText += host.box ?? "";
    const { sx, sy = sx, inset = 0 } = host;
    const [from, to] = drags[binding];
    for (const [type, [x, y]] of [
      ["pointerdown", from],
      ["pointermove", to],
    ] as const) {
      pointer(plain.container, type, x, y);
      pointer(hosted.container, type, (x + inset) * sx, (y + inset) * sy);
    }
    return { plain, hosted };
  }

  for (const host of hosts) {
    for (const binding of ["left", "right", "top", "bottom"] as const) {
      test(`${host.name}, bound ${binding}: a drag folds the page where the pointer is`, () => {
        const { plain, hosted } = twins(host, binding);
        expect(plain.book.state).toBe(FlipState.userFold);
        expect(hosted.book.state).toBe(FlipState.userFold);
        expect(hosted.container.innerHTML).toBe(plain.container.innerHTML);
      });
    }
  }
});

test("a Book exposes state through getters, not snapshots", () => {
  const { book } = mount();
  const snapshot: Book = book;
  book.turnNext();
  expect(snapshot.page).toBe(2);
});
