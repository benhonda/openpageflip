import { afterEach, describe, expect, test } from "vitest";
import { Binding, type Book, createBook, FlipState, Orientation } from "../src/index.ts";
import { resolveOptions } from "../src/options.ts";
import "../src/styles.css";
import { frames, pointer, stage, touch } from "./dom.ts";
import {
  expectParityUnder,
  makePages,
  makeStage,
  PAGE,
  type Pos,
  pointer as press,
  type Remap,
  sleep,
} from "./visual/harness.ts";

/**
 * Every binding is the left-bound book seen from another side: mirrored for `right`, transposed
 * for `top`, both for `bottom`, and nothing else. The kernel and the controller never see the
 * binding, so what is checked here is the boundary: layout, input and the renderer. The visual
 * half holds each bound book to its left-bound twin pixel for pixel, the way the parity suite
 * holds the left-bound book to the original.
 */

let cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup) fn();
  cleanup = [];
});

// ---- the picture -----------------------------------------------------------------------------

/** The left-bound book's container, in CSS pixels; the top-bound one gets the same box transposed. */
type Box = { width: number; height: number };
const LANDSCAPE: Box = { width: PAGE.width * 2, height: PAGE.height };
/** A 300px container is narrower than two pages, so the book goes portrait and sits centred. */
const PORTRAIT: Box = { width: 300, height: 420 };

/** Drives a book through pointer events; `at` places each position, which for a top-bound book means transposing it. */
type Drive = (at: (pos: Pos) => Pos, container: HTMLElement) => void;

type Scenario = {
  name: string;
  box: Box;
  cover?: boolean;
  hard?: number[];
  startPage?: number;
  /** Pointer positions on the left-bound book; the other bindings get them mapped. */
  drive?: Drive;
  settle?: number;
};

/**
 * How each binding sees the left-bound book: the box its container takes, where a left-bound
 * pointer position lands on it, and where a left-bound pixel is found in its screenshot. In
 * image pixels the mirror is `width - 1 - x`, since pixel `x` covers `[x, x + 1)`.
 */
type View = { box: (b: Box) => Box; at: (pos: Pos, box: Box) => Pos; remap: Remap };
const views: Record<Exclude<Binding, "left">, View> = {
  right: {
    box: (b) => b,
    at: (pos, box) => ({ x: box.width - pos.x, y: pos.y }),
    remap: (x, y, size) => ({ x: size.width - 1 - x, y }),
  },
  top: {
    box: (b) => ({ width: b.height, height: b.width }),
    at: (pos) => ({ x: pos.y, y: pos.x }),
    remap: (x, y) => ({ x: y, y: x }),
  },
  bottom: {
    box: (b) => ({ width: b.height, height: b.width }),
    at: (pos, box) => ({ x: pos.y, y: box.width - pos.x }),
    remap: (x, y, size) => ({ x: y, y: size.width - 1 - x }),
  },
};
const keep = (pos: Pos): Pos => pos;

const drag =
  (from: Pos, to: Pos): Drive =>
  (at, container) => {
    const step = {
      x: from.x + Math.sign(to.x - from.x) * 8,
      y: from.y + Math.sign(to.y - from.y) * 8,
    };
    press(container, "pointerdown", at(from));
    press(container, "pointermove", at(step));
    press(container, "pointermove", at(to));
  };

const scenarios: Scenario[] = [
  { name: "landscape-rest", box: LANDSCAPE },
  { name: "forward-top", box: LANDSCAPE, drive: drag({ x: 470, y: 40 }, { x: 330, y: 120 }) },
  { name: "forward-bottom", box: LANDSCAPE, drive: drag({ x: 480, y: 320 }, { x: 300, y: 250 }) },
  { name: "forward-past-spine", box: LANDSCAPE, drive: drag({ x: 470, y: 40 }, { x: 110, y: 90 }) },
  {
    name: "back-top",
    box: LANDSCAPE,
    startPage: 2,
    drive: drag({ x: 30, y: 40 }, { x: 160, y: 90 }),
  },
  {
    name: "back-bottom",
    box: LANDSCAPE,
    startPage: 2,
    drive: drag({ x: 20, y: 330 }, { x: 140, y: 300 }),
  },
  { name: "cover-rest", box: LANDSCAPE, cover: true },
  {
    name: "cover-forward-hard",
    box: LANDSCAPE,
    cover: true,
    drive: drag({ x: 470, y: 40 }, { x: 330, y: 100 }),
  },
  {
    name: "cover-forward-hard-past-spine",
    box: LANDSCAPE,
    cover: true,
    drive: drag({ x: 470, y: 40 }, { x: 150, y: 100 }),
  },
  {
    name: "hard-middle-back",
    box: LANDSCAPE,
    hard: [2, 3],
    startPage: 2,
    drive: drag({ x: 30, y: 40 }, { x: 180, y: 120 }),
  },
  { name: "portrait-rest", box: PORTRAIT },
  { name: "portrait-forward", box: PORTRAIT, drive: drag({ x: 260, y: 60 }, { x: 150, y: 120 }) },
  {
    name: "portrait-back",
    box: PORTRAIT,
    startPage: 2,
    drive: drag({ x: 40, y: 60 }, { x: 100, y: 120 }),
  },
  {
    name: "hover-corner",
    box: LANDSCAPE,
    drive: (at, container) => {
      press(container, "pointermove", at({ x: 470, y: 30 }), false);
      setTimeout(() => press(container, "pointermove", at({ x: 455, y: 45 }), false), 150);
    },
    settle: 300,
  },
  // The clip to the page on show is the renderer's own, outside the kernel's fold, so each
  // binding has to map it itself.
  {
    name: "portrait-back-cue",
    box: PORTRAIT,
    startPage: 2,
    drive: (at, container) => press(container, "pointermove", at({ x: 40, y: 300 }), false),
    settle: 400,
  },
];

/**
 * Mount one book in a container of exactly `box`, sized by hand so the containers match under
 * the view (autoSize would cap a top-bound container at one page wide).
 */
function mountBox(
  box: Box,
  scenario: Scenario,
  binding: Binding,
): { stage: HTMLElement; container: HTMLElement; book: Book } {
  const el = makeStage(box.width);
  const container = el.firstElementChild as HTMLElement;
  container.style.width = `${box.width}px`;
  container.style.height = `${box.height}px`;
  // Solid colours and borders only: a page's text would not mirror or transpose with the page.
  // Borders inside the box, so a page's box is the mirror of its twin's; a content-box border
  // grows rightward and downward on both, which is not a mirror.
  const pages = makePages(6, scenario.hard ?? []);
  for (const page of pages) {
    page.textContent = "";
    page.style.boxSizing = "border-box";
  }
  container.append(...pages);
  const size =
    binding === "top" || binding === "bottom" ? { width: PAGE.height, height: PAGE.width } : PAGE;
  const book = createBook(container, {
    ...size,
    binding,
    autoSize: false,
    cover: scenario.cover ?? false,
    startPage: scenario.startPage ?? 0,
  });
  cleanup.push(() => {
    book.destroy();
    el.remove();
  });
  return { stage: el, container, book };
}

for (const binding of [Binding.right, Binding.top, Binding.bottom] as const) {
  const view = views[binding];
  describe(`a ${binding}-bound book is the left-bound book seen from the ${binding}`, () => {
    for (const scenario of scenarios) {
      test(scenario.name, async () => {
        const left = mountBox(scenario.box, scenario, "left");
        const other = mountBox(view.box(scenario.box), scenario, binding);
        await frames(2);
        scenario.drive?.(keep, left.container);
        scenario.drive?.((pos) => view.at(pos, scenario.box), other.container);
        await frames(3);
        if (scenario.settle) await sleep(scenario.settle);

        const a = left.stage.getBoundingClientRect();
        const b = other.stage.getBoundingClientRect();
        const expected = view.box({ width: a.width, height: a.height });
        expect({ width: b.width, height: b.height }).toEqual(expected);
        await expectParityUnder(`${binding}-${scenario.name}`, left.stage, other.stage, view.remap);
      });
    }
  });
}

// ---- the boundary ----------------------------------------------------------------------------

/** A self-sized book in a stage of `width`, with `binding` set on it. */
function mount(binding: Binding, width: number, options: Parameters<typeof createBook>[1]) {
  const s = stage(width);
  const book = createBook(s.container, { ...options, binding });
  cleanup.push(() => {
    book.destroy();
    s.stage.remove();
  });
  return { ...s, book };
}

describe("binding: 'top'", () => {
  const mountTop = (width: number, options: Parameters<typeof createBook>[1]) =>
    mount(Binding.top, width, options);
  test("is rejected when it is not a known binding", () => {
    expect(() =>
      // @ts-expect-error: the point is a value the type forbids
      resolveOptions({ width: 1, height: 1, binding: "spiral" }),
    ).toThrow('unknown "binding"');
  });

  test("sizes the container one page wide and stacks the spread down it", () => {
    const spread = mountTop(600, { width: 250, height: 350 });
    expect(spread.book.orientation).toBe(Orientation.landscape);
    const box = spread.container.getBoundingClientRect();
    expect({ width: box.width, height: box.height }).toEqual({ width: 250, height: 700 });
    // The rect is in book space: two pages "wide" along the screen's height.
    expect(spread.book.rect).toEqual({ left: 0, top: 0, width: 700, height: 250, pageWidth: 350 });

    const single = mountTop(600, { width: 250, height: 350, layout: "single" });
    const one = single.container.getBoundingClientRect();
    expect({ width: one.width, height: one.height }).toEqual({ width: 250, height: 350 });
  });

  test("auto layout goes single when the container is too short for two pages", () => {
    // Sizing itself, the container is always two pages tall, so a narrow stage changes nothing.
    const selfSized = mountTop(300, { width: 250, height: 350 });
    expect(selfSized.book.orientation).toBe(Orientation.landscape);
    // Sized by its host, it can be too short.
    const short = mountTop(600, { width: 250, height: 350, autoSize: false });
    short.container.style.cssText = "width: 250px; height: 400px;";
    short.book.update();
    expect(short.book.orientation).toBe(Orientation.portrait);
    short.container.style.height = "700px";
    short.book.update();
    expect(short.book.orientation).toBe(Orientation.landscape);
  });

  test("stretch fills the width and maxWidth caps the page as seen on screen", () => {
    const { book, container } = mountTop(700, {
      width: 250,
      height: 350,
      size: "stretch",
      maxWidth: 400,
    });
    expect(container.getBoundingClientRect().width).toBe(400);
    // Book space: the page's screen height is its width along the spine axis.
    expect(book.rect.pageWidth).toBe(560);
    expect(book.rect.height).toBe(400);
  });

  test("marks the container and names page sides top and bottom", () => {
    const { book, container, pages } = mountTop(600, { width: 250, height: 350 });
    expect(container.classList.contains("opf-book--top")).toBe(true);
    expect(getComputedStyle(container).touchAction).toBe("pan-x");
    expect(pages[0]?.classList.contains("opf-page--top")).toBe(true);
    expect(pages[1]?.classList.contains("opf-page--bottom")).toBe(true);
    expect(container.querySelector(".opf-page--left, .opf-page--right")).toBeNull();
    book.destroy();
    expect(container.classList.contains("opf-book--top")).toBe(false);
  });

  test("turns on a quick vertical touch swipe and leaves a horizontal one alone", async () => {
    const { book, container } = mountTop(600, { width: 250, height: 350, flipDuration: 40 });
    pointer(container, "pointerdown", 125, 600, touch);
    pointer(container, "pointermove", 125, 500, touch);
    pointer(container, "pointerup", 125, 500, touch);
    await new Promise((r) => setTimeout(r, 120));
    expect(book.page).toBe(2);

    pointer(container, "pointerdown", 50, 500, touch);
    pointer(container, "pointermove", 200, 500, touch);
    pointer(container, "pointerup", 200, 500, touch);
    await new Promise((r) => setTimeout(r, 120));
    expect(book.page).toBe(2);
  });

  test("a drag from the bottom edge folds the page, and past the spine it turns", async () => {
    const { book, container } = mountTop(600, { width: 250, height: 350, flipDuration: 40 });
    // The bottom page's outer edge is the container's bottom; the spine is at its middle.
    pointer(container, "pointerdown", 240, 690);
    pointer(container, "pointermove", 240, 600);
    expect(book.state).toBe(FlipState.userFold);
    pointer(container, "pointermove", 240, 200);
    pointer(container, "pointerup", 240, 200);
    await new Promise((r) => setTimeout(r, 200));
    expect(book.page).toBe(2);
  });

  test("hovering the bottom edge furls it; the middle of a page furls nothing", () => {
    const { book, container } = mountTop(600, { width: 250, height: 350 });
    pointer(container, "pointermove", 125, 350 + 175, { buttons: 0, button: -1 });
    expect(book.state).toBe(FlipState.read);
    pointer(container, "pointermove", 20, 690, { buttons: 0, button: -1 });
    expect(book.state).toBe(FlipState.foldCorner);
  });
});

describe("binding: 'right'", () => {
  const mountRight = (width: number, options: Parameters<typeof createBook>[1]) =>
    mount(Binding.right, width, options);

  test("puts the cover alone on the left and a spread's pages right to left", () => {
    const { pages, container } = mountRight(500, { width: 250, height: 350, cover: true });
    expect(container.classList.contains("opf-book--right")).toBe(true);
    expect(pages[0]?.classList.contains("opf-page--left")).toBe(true);
    expect(pages[0]?.style.left).toBe("0px");
    const other = mountRight(500, { width: 250, height: 350, startPage: 2 });
    expect(other.pages[2]?.classList.contains("opf-page--right")).toBe(true);
    expect(other.pages[2]?.style.left).toBe("250px");
    expect(other.pages[3]?.classList.contains("opf-page--left")).toBe(true);
    expect(other.pages[3]?.style.left).toBe("0px");
  });

  test("reads on with a swipe to the right, and back with one to the left", async () => {
    const { book, container } = mountRight(500, { width: 250, height: 350, flipDuration: 40 });
    pointer(container, "pointerdown", 100, 100, touch);
    pointer(container, "pointermove", 200, 100, touch);
    pointer(container, "pointerup", 200, 100, touch);
    await new Promise((r) => setTimeout(r, 120));
    expect(book.page).toBe(2);
    pointer(container, "pointerdown", 400, 100, touch);
    pointer(container, "pointermove", 300, 100, touch);
    pointer(container, "pointerup", 300, 100, touch);
    await new Promise((r) => setTimeout(r, 120));
    expect(book.page).toBe(0);
  });

  test("turns forward from the left page's outer edge", async () => {
    const { book, container } = mountRight(500, { width: 250, height: 350, flipDuration: 40 });
    pointer(container, "pointerdown", 10, 40);
    pointer(container, "pointermove", 120, 60);
    expect(book.state).toBe(FlipState.userFold);
    pointer(container, "pointermove", 400, 90);
    pointer(container, "pointerup", 400, 90);
    await new Promise((r) => setTimeout(r, 200));
    expect(book.page).toBe(2);
  });
});
