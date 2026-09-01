import { describe, expect, test } from "vitest";
import { FlipController, type Frame } from "../src/controller.ts";
import { computeLayout } from "../src/layout.ts";
import {
  type BookOptions,
  FlipCorner,
  FlipState,
  Orientation,
  type ResolvedOptions,
  resolveOptions,
} from "../src/options.ts";
import { createPages } from "../src/pages.ts";
import { buildSpreads } from "../src/pagination.ts";
import { createManualClock } from "./clock.ts";

/** A 6-page book in a 500x350 container: landscape, two pages of 250x350, rect at (0, 0). */
function setup(
  overrides: Partial<BookOptions & { flipDuration: number }> = {},
  pageCount = 6,
  container = { w: 500, h: 350 },
) {
  const options: ResolvedOptions = { ...resolveOptions({ width: 250, height: 350, ...overrides }) };
  const elements = Array.from({ length: pageCount }, () => document.createElement("div"));
  const pages = createPages(
    elements,
    buildSpreads(pageCount, Orientation.landscape, options.cover).hardByPosition,
  );
  const frames: Frame[] = [];
  const shown: number[] = [];
  const states: FlipState[] = [];
  const manual = createManualClock();
  const controller = new FlipController(
    options,
    manual.clock,
    {
      onFrame: (f) => frames.push(f),
      onPage: (p) => shown.push(p),
      onState: (s) => states.push(s),
    },
    pages,
    computeLayout(container.w, container.h, options),
  );
  controller.showPage(options.startPage);
  const last = () => frames[frames.length - 1] as Frame;
  return { controller, frames, shown, states, manual, last };
}

/** Run the clock until the promise settles or `limit` ms pass. */
async function settle<T>(
  promise: Promise<T>,
  manual: ReturnType<typeof createManualClock>,
  limit = 5000,
): Promise<T> {
  let settled = false;
  let value: T | undefined;
  void promise.then((v) => {
    settled = true;
    value = v;
  });
  for (let elapsed = 0; elapsed < limit && !settled; elapsed += 16) {
    manual.advance(16);
    await Promise.resolve();
  }
  if (!settled) throw new Error("animation did not settle");
  return value as T;
}

describe("FlipController", () => {
  test("requests no frames while idle, even after a drag", () => {
    const { controller, manual, frames } = setup();
    expect(manual.pending()).toBe(0);
    controller.pointerDown({ x: 470, y: 40 });
    controller.pointerDrag({ x: 330, y: 120 });
    expect(frames.at(-1)?.flip).not.toBeNull();
    expect(manual.pending()).toBe(0);
  });

  test("flipNext animates, turns the spread and resolves true", async () => {
    const { controller, manual, states, shown, last } = setup();
    const promise = controller.flipNext(FlipCorner.top);
    expect(controller.currentState).toBe(FlipState.flipping);
    expect(manual.pending()).toBe(1);
    expect(await settle(promise, manual)).toBe(true);
    expect(controller.page).toBe(2);
    expect(shown).toEqual([2]);
    expect(states).toEqual([FlipState.flipping, FlipState.read]);
    expect(last().flip).toBeNull();
    expect(manual.pending()).toBe(0);
  });

  test("flipNext on the last spread resolves false and stays put", async () => {
    const { controller, manual } = setup({ startPage: 4 });
    expect(await settle(controller.flipNext(FlipCorner.top), manual)).toBe(false);
    expect(controller.page).toBe(4);
    expect(controller.currentState).toBe(FlipState.read);
  });

  test("a drag released past the spine turns the page; released early it drops back", async () => {
    const { controller, manual, last } = setup();
    controller.pointerDown({ x: 470, y: 40 });
    controller.pointerDrag({ x: 100, y: 90 });
    expect(controller.currentState).toBe(FlipState.userFold);
    expect(last().flip?.fold.position.x).toBeLessThanOrEqual(0);
    controller.pointerUp({ x: 100, y: 90 });
    for (let i = 0; i < 100; i++) manual.advance(16);
    expect(controller.page).toBe(2);
    expect(controller.currentState).toBe(FlipState.read);

    controller.pointerDown({ x: 470, y: 40 });
    controller.pointerDrag({ x: 400, y: 100 });
    controller.pointerUp({ x: 400, y: 100 });
    for (let i = 0; i < 100; i++) manual.advance(16);
    expect(controller.page).toBe(2);
    expect(last().flip).toBeNull();
  });

  test("a press without movement is a click that flips", async () => {
    const { controller, manual } = setup();
    controller.pointerDown({ x: 470, y: 40 });
    controller.pointerUp({ x: 472, y: 41 });
    expect(controller.currentState).toBe(FlipState.flipping);
    for (let i = 0; i < 100; i++) manual.advance(16);
    expect(controller.page).toBe(2);
  });

  test("click mode 'corners' ignores clicks in the middle of a page", () => {
    const { controller } = setup({ click: "corners" });
    controller.pointerDown({ x: 400, y: 175 });
    controller.pointerUp({ x: 400, y: 175 });
    expect(controller.currentState).toBe(FlipState.read);
    controller.pointerDown({ x: 490, y: 10 });
    controller.pointerUp({ x: 490, y: 10 });
    expect(controller.currentState).toBe(FlipState.flipping);
  });

  test("flipTo during a running flip lands it first, then aims from there", async () => {
    const { controller, manual } = setup();
    void controller.flipNext(FlipCorner.top);
    manual.advance(16);
    const promise = controller.flipTo(5, FlipCorner.top);
    // The first flip landed on spread [2, 3]; the second aims at [4, 5], one turn away.
    expect(await settle(promise, manual)).toBe(true);
    expect(controller.page).toBe(4);
  });

  test("a press during a flip lands it, and the drag that follows starts from the settled book", () => {
    const { controller, manual, last } = setup();
    void controller.flipNext(FlipCorner.top);
    manual.advance(16);
    controller.pointerDown({ x: 470, y: 40 });
    expect(controller.page).toBe(2);
    expect(controller.currentState).toBe(FlipState.read);
    controller.pointerDrag({ x: 330, y: 120 });
    expect(controller.currentState).toBe(FlipState.userFold);
    expect(last().flip?.flipping).toBe(4);
  });

  test("with drag off, a long press-and-move neither folds nor clicks", () => {
    const { controller, last } = setup({ drag: false });
    controller.pointerDown({ x: 470, y: 40 });
    controller.pointerDrag({ x: 200, y: 120 });
    expect(last().flip).toBeNull();
    controller.pointerUp({ x: 200, y: 120 });
    expect(controller.currentState).toBe(FlipState.read);
    expect(controller.page).toBe(0);
  });

  test("turnTo out of range throws instead of doing nothing", () => {
    const { controller } = setup();
    expect(() => controller.showPage(42)).toThrow(RangeError);
  });

  test("a resize mid-drag drops the fold, which was computed for the old page size", () => {
    const { controller, last } = setup({ size: "stretch" });
    controller.pointerDown({ x: 470, y: 40 });
    controller.pointerDrag({ x: 330, y: 120 });
    expect(last().flip).not.toBeNull();
    const options = resolveOptions({ width: 250, height: 350, size: "stretch" });
    controller.setLayout(computeLayout(600, 420, options));
    expect(last().flip).toBeNull();
  });

  test("flipTo jumps beside the target and animates the last turn", async () => {
    const { controller, manual, shown } = setup();
    expect(await settle(controller.flipTo(5, FlipCorner.bottom), manual)).toBe(true);
    expect(controller.page).toBe(4);
    expect(shown.at(-1)).toBe(4);
    expect(await settle(controller.flipTo(4, FlipCorner.top), manual)).toBe(false);
  });

  test("hovering a corner lifts it; leaving drops it", () => {
    const { controller, manual, last } = setup();
    controller.hover({ x: 470, y: 30 });
    expect(controller.currentState).toBe(FlipState.foldCorner);
    for (let i = 0; i < 10; i++) manual.advance(16);
    expect(last().flip).not.toBeNull();
    expect(last().flip?.fold.position).toEqual({ x: 200, y: 50 });
    controller.hoverEnd();
    for (let i = 0; i < 20; i++) manual.advance(16);
    expect(controller.currentState).toBe(FlipState.read);
    expect(last().flip).toBeNull();
    expect(controller.page).toBe(0);
  });

  test("hovering the middle of a page lifts nothing", () => {
    const { controller, last } = setup();
    controller.hover({ x: 300, y: 175 });
    expect(controller.currentState).toBe(FlipState.read);
    expect(last().flip).toBeNull();
  });

  test("a zero duration (reduced motion) lands the flip synchronously", async () => {
    const options: ResolvedOptions = {
      ...resolveOptions({ width: 250, height: 350 }),
      flipDuration: 0,
    };
    const elements = Array.from({ length: 6 }, () => document.createElement("div"));
    const pages = createPages(elements, new Set());
    const manual = createManualClock();
    const controller = new FlipController(
      options,
      manual.clock,
      { onFrame: () => {}, onPage: () => {}, onState: () => {} },
      pages,
      computeLayout(500, 350, options),
    );
    controller.showPage(0);
    const promise = controller.flipNext(FlipCorner.top);
    expect(controller.page).toBe(2);
    expect(controller.currentState).toBe(FlipState.read);
    expect(manual.pending()).toBe(0);
    expect(await promise).toBe(true);
  });

  test("destroy cancels the running animation and settles its promise", async () => {
    const { controller, manual } = setup();
    const promise = controller.flipNext(FlipCorner.top);
    manual.advance(16);
    controller.destroy();
    expect(manual.pending()).toBe(0);
    expect(await promise).toBe(false);
  });

  test("portrait pairs each page with itself and turns one page at a time", async () => {
    const { controller, manual, last } = setup({}, 6, { w: 300, h: 420 });
    expect(controller.currentOrientation).toBe(Orientation.portrait);
    expect(last().left).toBeNull();
    expect(last().right).toBe(0);
    expect(await settle(controller.flipNext(FlipCorner.top), manual)).toBe(true);
    expect(controller.page).toBe(1);
  });

  test("a cover is hard and shown alone; the lone last page is hard too", () => {
    const { controller, last } = setup({ cover: true }, 6);
    expect(last().left).toBeNull();
    expect(last().right).toBe(0);
    controller.showPage(5);
    expect(last().left).toBe(5);
    expect(last().right).toBeNull();
  });

  test("changing orientation re-paginates and keeps the current spread's first page", () => {
    const { controller, last } = setup({ startPage: 3 });
    // A spread reports its first page, as the original did: opening on page 3 shows [2, 3].
    expect(controller.page).toBe(2);
    const options = resolveOptions({ width: 250, height: 350 });
    expect(controller.setLayout(computeLayout(300, 420, options))).toBe(true);
    expect(controller.currentOrientation).toBe(Orientation.portrait);
    expect(controller.page).toBe(2);
    expect(last().right).toBe(2);
    expect(controller.setLayout(computeLayout(500, 350, options))).toBe(true);
    expect(last().left).toBe(2);
    expect(last().right).toBe(3);
  });
});
