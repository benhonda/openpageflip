import { describe, expect, test } from "vitest";
import { FlipController, type FlipProgress, type Frame, REST_NUDGE } from "../src/controller.ts";
import { computeLayout } from "../src/layout.ts";
import {
  type BookOptions,
  FlipCorner,
  FlipDirection,
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
  const progress: FlipProgress[] = [];
  const manual = createManualClock();
  const controller = new FlipController(
    options,
    manual.clock,
    {
      onFrame: (f) => frames.push(f),
      onPage: (p) => shown.push(p),
      onState: (s) => states.push(s),
      onProgress: (p) => progress.push(p),
    },
    pages,
    computeLayout(container.w, container.h, options),
  );
  controller.showPage(options.startPage);
  const last = () => frames[frames.length - 1] as Frame;
  return { controller, frames, shown, states, progress, manual, last };
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

  test("by default a click turns from the page's outer edge, at any height, not from the middle", () => {
    const { controller } = setup();
    // The strip is a fifth of the page diagonal wide: 86px of a 250x350 page.
    controller.pointerDown({ x: 400, y: 175 });
    controller.pointerUp({ x: 400, y: 175 });
    expect(controller.currentState).toBe(FlipState.read);
    controller.pointerDown({ x: 420, y: 175 });
    controller.pointerUp({ x: 420, y: 175 });
    expect(controller.currentState).toBe(FlipState.flipping);
  });

  test("click: 'anywhere' turns from the middle of a page", () => {
    const { controller } = setup({ click: "anywhere" });
    controller.pointerDown({ x: 400, y: 175 });
    controller.pointerUp({ x: 400, y: 175 });
    expect(controller.currentState).toBe(FlipState.flipping);
  });

  test("a press in the middle of a page is not taken hold of: it neither folds nor clicks", () => {
    const { controller, last } = setup();
    expect(controller.pointerDown({ x: 400, y: 175 })).toBe(false);
    controller.pointerDrag({ x: 200, y: 120 });
    expect(last().flip).toBeNull();
    controller.pointerUp({ x: 200, y: 120 });
    expect(controller.currentState).toBe(FlipState.read);
    expect(controller.page).toBe(0);
    expect(controller.pointerDown({ x: 470, y: 40 })).toBe(true);
  });

  test("with drag and click both off, a press is not taken hold of and hover lifts nothing", () => {
    const { controller, last } = setup({ drag: false, click: "off" });
    expect(controller.pointerDown({ x: 470, y: 40 })).toBe(false);
    controller.pointerUp({ x: 470, y: 40 });
    controller.hover({ x: 470, y: 40 });
    expect(controller.currentState).toBe(FlipState.read);
    expect(last().flip).toBeNull();
  });

  test("in portrait the visible page's spine-side edge turns back and its outer edge forward", () => {
    // 300px container: one 250x350 page centred in it, from x = 25, so the edge strip is 86px wide.
    const { controller, progress } = setup({ startPage: 2 }, 6, { w: 300, h: 420 });
    controller.pointerDown({ x: 150, y: 200 });
    controller.pointerUp({ x: 150, y: 200 });
    expect(controller.currentState).toBe(FlipState.read);
    controller.pointerDown({ x: 40, y: 200 });
    controller.pointerUp({ x: 40, y: 200 });
    expect(controller.currentState).toBe(FlipState.flipping);
    expect(progress.at(-1)).toMatchObject({ from: 2, to: 1, direction: "back" });
  });

  test("in portrait the page coming back is its forward turn run backward, laid over the page on show", () => {
    const { controller, progress, last } = setup({ startPage: 2 }, 6, { w: 300, h: 420 });
    controller.pointerDown({ x: 40, y: 200 });
    controller.pointerDrag({ x: 100, y: 200 });
    // Its fold runs forward, off itself, over the page it is coming back onto; nothing of it lies
    // in the hidden half. The turn is still back.
    expect(last()).toMatchObject({
      right: 1,
      flip: { direction: "forward", flipping: 1, bottom: 2 },
    });
    expect(progress.at(-1)).toMatchObject({ from: 2, to: 1, direction: "back" });
    // The pointer holds the crease: it has come 60px from where the press took hold.
    const { top, bottom } = last().flip?.fold.intersections ?? {};
    expect(Math.abs(((top?.x ?? 0) + (bottom?.x ?? 0)) / 2 - 60)).toBeLessThan(2);
  });

  test("in portrait the cue for the page coming back uncurls a strip over the spine, and never turns", () => {
    const { controller, manual, progress, shown, last } = setup({ startPage: 2 }, 6, {
      w: 300,
      h: 420,
    });
    shown.length = 0;
    controller.hover({ x: 40, y: 370 });
    manual.advance(1000);
    // A crease a furl's depth past the spine, leaning toward the pointer near the bottom corner.
    expect(last()).toMatchObject({ right: 1, flip: { flipping: 1, bottom: 2 } });
    const { top, bottom } = last().flip?.fold.intersections ?? {};
    expect(bottom?.x).toBeGreaterThan(top?.x ?? Infinity);
    expect(Math.abs(((top?.x ?? 0) + (bottom?.x ?? 0)) / 2 - 30)).toBeLessThan(2);
    // Barely begun, as the page is, and shaded like a turn just begun: its fold is nearly all the
    // way back, where a forward turn's shadows have faded to nothing.
    expect(progress.at(-1)).toMatchObject({ from: 2, to: 1, direction: "back" });
    expect(progress.at(-1)?.progress).toBeLessThan(0.25);
    expect(last().flip?.shadow?.opacity).toBeGreaterThan(0.25);

    // Leaving the edge, or the book, lets it curl away again; the page never turns.
    controller.hover({ x: 150, y: 370 });
    manual.advance(1000);
    expect(last().flip).toBeNull();
    expect(last().right).toBe(2);
    expect(progress.at(-1)?.progress).toBe(0);
    controller.hover({ x: 40, y: 370 });
    manual.advance(1000);
    controller.hoverEnd();
    manual.advance(1000);
    expect(controller.page).toBe(2);
    expect(shown).toEqual([]);

    // The outer edge furls like any other.
    controller.hover({ x: 260, y: 370 });
    manual.advance(1000);
    expect(last()).toMatchObject({ right: 2, flip: { direction: "forward", flipping: 2 } });
  });

  test("a press takes that cue in hand: the crease stays under the pointer, and past the middle it turns", () => {
    const { controller, manual, last } = setup({ startPage: 2 }, 6, { w: 300, h: 420 });
    const crease = () => {
      const { top, bottom } = last().flip?.fold.intersections ?? {};
      return ((top?.x ?? 0) + (bottom?.x ?? 0)) / 2;
    };
    controller.hover({ x: 40, y: 370 });
    manual.advance(1000);
    const cue = crease();
    controller.pointerDown({ x: 40, y: 370 });
    controller.pointerDrag({ x: 60, y: 370 });
    expect(Math.abs(crease() - (cue + 20))).toBeLessThan(2);
    // Short of the middle and let go, it curls away again.
    controller.pointerDrag({ x: 120, y: 370 });
    controller.pointerUp({ x: 120, y: 370 });
    manual.advance(2000);
    expect(controller.page).toBe(2);
    // Past the middle, it lands. The 250px page sits centred in the 300px box, from x = 25, so
    // its middle is at x = 150.
    controller.pointerDown({ x: 30, y: 370 });
    controller.pointerDrag({ x: 180, y: 370 });
    controller.pointerUp({ x: 180, y: 370 });
    manual.advance(2000);
    expect(controller.page).toBe(1);
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

  test("hovering an edge furls it over a quarter of flipDuration; leaving settles it as slowly", () => {
    const { controller, manual, last } = setup();
    controller.hover({ x: 470, y: 175 });
    expect(controller.currentState).toBe(FlipState.foldCorner);
    // Halfway through the 250ms furl the edge is part way in, not already there.
    for (let i = 0; i < 8; i++) manual.advance(16);
    const midway = last().flip?.fold.position;
    expect(midway?.x).toBeGreaterThan(190);
    expect(midway?.x).toBeLessThan(249);
    for (let i = 0; i < 10; i++) manual.advance(16);
    // Midway along the edge the corner is pulled straight in: the crease runs parallel to the
    // spine, 30px in.
    expect(last().flip?.fold.position).toEqual({ x: 190, y: 350 - REST_NUDGE.down });
    expect(Math.abs(last().flip?.fold.angle ?? 1)).toBeLessThan(0.05);

    controller.hoverEnd();
    expect(controller.currentState).toBe(FlipState.read);
    // The drop animates too: part way through, the edge is still furled.
    for (let i = 0; i < 8; i++) manual.advance(16);
    expect(last().flip).not.toBeNull();
    for (let i = 0; i < 10; i++) manual.advance(16);
    expect(last().flip).toBeNull();
    expect(controller.page).toBe(0);
  });

  test("the furl holds anywhere along the edge, leaning toward the pointer, and settles when it leaves", () => {
    const { controller, manual, last } = setup();
    /** How far in the crease is at the top and at the bottom of the page. */
    const depths = () => {
      const { top, bottom } = last().flip?.fold.intersections ?? {};
      return { top: 250 - (top?.x ?? 250), bottom: 250 - (bottom?.x ?? 250) };
    };
    controller.hover({ x: 470, y: 30 });
    // On its way in, the furl already aims at where the pointer has moved to.
    for (let i = 0; i < 4; i++) manual.advance(16);
    controller.hover({ x: 470, y: 320 });
    for (let i = 0; i < 20; i++) manual.advance(16);
    expect(depths().bottom).toBeGreaterThan(depths().top + 10);
    // Furled, it follows the pointer frame for frame, with no animation to wait on.
    expect(manual.pending()).toBe(0);
    controller.hover({ x: 470, y: 30 });
    expect(depths().top).toBeGreaterThan(depths().bottom + 10);
    controller.hover({ x: 470, y: 175 });
    // Midway it is parallel, but for the whisker of tilt `REST_NUDGE` gives it.
    expect(Math.abs(depths().top - depths().bottom)).toBeLessThan(3);
    expect(controller.currentState).toBe(FlipState.foldCorner);
    expect(manual.pending()).toBe(0);
    controller.hover({ x: 300, y: 175 });
    expect(controller.currentState).toBe(FlipState.read);
  });

  test("a settling edge is not restarted by the pointer moving on; it lands on schedule", () => {
    const { controller, manual, last } = setup();
    controller.hover({ x: 470, y: 175 });
    for (let i = 0; i < 20; i++) manual.advance(16);
    expect(last().flip?.fold.position).toEqual({ x: 190, y: 350 - REST_NUDGE.down });

    // Off the edge, and the mouse keeps moving while the edge settles.
    controller.hover({ x: 300, y: 175 });
    let previousX = 190;
    for (let i = 0; i < 16; i++) {
      manual.advance(16);
      const position = last().flip?.fold.position;
      if (position !== undefined) {
        expect(position.x).toBeGreaterThan(previousX);
        previousX = position.x;
      }
      controller.hover({ x: 300 + i, y: 175 });
    }
    // 256ms have passed: the 250ms settle has landed.
    expect(last().flip).toBeNull();
    expect(controller.currentState).toBe(FlipState.read);
  });

  test("an edge that is settling waits to land; the other page's edge is left alone meanwhile", () => {
    const { controller, manual, last } = setup({ startPage: 2 });
    controller.hover({ x: 470, y: 175 });
    for (let i = 0; i < 20; i++) manual.advance(16);
    // Straight across to the left page's edge: the right one settles first.
    controller.hover({ x: 30, y: 30 });
    expect(controller.currentState).toBe(FlipState.read);
    manual.advance(16);
    expect(last().flip?.fold.position.x).toBeGreaterThan(190);
    expect(last().flip?.direction).toBe(FlipDirection.forward);
    for (let i = 0; i < 20; i++) manual.advance(16);
    expect(last().flip).toBeNull();
    // Settled: the next move furls the left page.
    controller.hover({ x: 30, y: 30 });
    expect(controller.currentState).toBe(FlipState.foldCorner);
    expect(last().flip?.direction).toBe(FlipDirection.back);
  });

  test("a drag moves the fold by the pointer's travel: straight in furls the edge, from a corner it folds across", () => {
    const { controller, manual, last } = setup();
    // Mid-edge, straight in: the crease stays parallel to the spine. The corner starts a nudge
    // inside its rest, where the fold is not degenerate.
    controller.pointerDown({ x: 470, y: 150 });
    controller.pointerDrag({ x: 370, y: 150 });
    expect(controller.currentState).toBe(FlipState.userFold);
    expect(last().flip?.fold.position).toEqual({
      x: 250 - REST_NUDGE.in - 100,
      y: REST_NUDGE.down,
    });
    expect(Math.abs(last().flip?.fold.angle ?? 1)).toBeLessThan(0.05);
    controller.pointerCancel();
    for (let i = 0; i < 20; i++) manual.advance(16); // the drop lands; a press mid-drop would carry on from it
    // From the corner, diagonally: the corner is where the pointer took it.
    controller.pointerDown({ x: 500 - REST_NUDGE.in, y: REST_NUDGE.down });
    controller.pointerDrag({ x: 400, y: 100 });
    expect(last().flip?.fold.position).toEqual({ x: 150, y: 100 });
    expect(Math.abs(last().flip?.fold.angle ?? 0)).toBeGreaterThan(0.5);
    controller.pointerCancel();
  });

  test("a press on a furled edge drags on from where the furl got to", () => {
    const { controller, manual, last } = setup();
    controller.hover({ x: 470, y: 150 });
    for (let i = 0; i < 8; i++) manual.advance(16);
    const midway = last().flip?.fold.position;
    if (midway === undefined) throw new Error("no fold");
    controller.pointerDown({ x: 470, y: 150 });
    controller.pointerDrag({ x: 450, y: 150 });
    expect(controller.currentState).toBe(FlipState.userFold);
    expect(last().flip?.fold.position.x).toBeCloseTo(midway.x - 20, 6);
    expect(last().flip?.fold.position.y).toBeCloseTo(midway.y, 6);
    expect(manual.pending()).toBe(0);
  });

  test("a click on a furled edge flips on from the furl", async () => {
    const { controller, manual, last } = setup({ flipDuration: 200 });
    controller.hover({ x: 470, y: 175 });
    for (let i = 0; i < 20; i++) manual.advance(16);
    controller.pointerDown({ x: 470, y: 175 });
    controller.pointerUp({ x: 470, y: 175 });
    expect(controller.currentState).toBe(FlipState.flipping);
    expect(last().flip?.fold.position).toEqual({ x: 190, y: 350 - REST_NUDGE.down });
    manual.advance(16);
    expect(last().flip?.fold.position.x).toBeLessThan(190);
    for (let i = 0; i < 30; i++) manual.advance(16);
    await Promise.resolve();
    expect(controller.page).toBe(2);
  });

  test("hovering the middle of a page furls nothing", () => {
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
      { onFrame: () => {}, onPage: () => {}, onState: () => {}, onProgress: () => {} },
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

  test("progress follows an animated flip from its spread to the next and ends on exactly 1", async () => {
    const { controller, manual, progress } = setup();
    expect(await settle(controller.flipNext(FlipCorner.top), manual)).toBe(true);
    expect(progress.length).toBeGreaterThan(10);
    for (const p of progress) expect(p).toMatchObject({ from: 0, to: 2, direction: "forward" });
    const values = progress.map((p) => p.progress);
    expect(values[0]).toBeGreaterThan(0);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
    expect(values.at(-1)).toBe(1);
  });

  test("progress follows a drag both ways: dropped back it ends on exactly 0, carried over on 1", () => {
    const { controller, manual, progress } = setup();
    controller.pointerDown({ x: 470, y: 40 });
    controller.pointerDrag({ x: 400, y: 100 });
    controller.pointerDrag({ x: 300, y: 100 });
    controller.pointerDrag({ x: 380, y: 100 });
    const dragged = progress.map((p) => p.progress);
    expect(dragged).toHaveLength(3);
    expect(dragged[1]).toBeGreaterThan(dragged[0] as number);
    expect(dragged[2]).toBeLessThan(dragged[1] as number);
    controller.pointerUp({ x: 380, y: 100 });
    for (let i = 0; i < 100; i++) manual.advance(16);
    expect(progress.at(-1)).toEqual({ from: 0, to: 2, direction: "forward", progress: 0 });
    expect(controller.page).toBe(0);

    controller.pointerDown({ x: 470, y: 40 });
    controller.pointerDrag({ x: 100, y: 90 });
    controller.pointerUp({ x: 100, y: 90 });
    for (let i = 0; i < 100; i++) manual.advance(16);
    expect(progress.at(-1)).toEqual({ from: 0, to: 2, direction: "forward", progress: 1 });
  });

  test("a furled edge reports its little progress, and settling closes the turn on 0", () => {
    const { controller, manual, progress } = setup({ startPage: 2 });
    controller.hover({ x: 30, y: 175 });
    for (let i = 0; i < 20; i++) manual.advance(16);
    expect(progress.at(-1)).toMatchObject({ from: 2, to: 0, direction: "back" });
    expect(progress.at(-1)?.progress).toBeCloseTo(60 / 500, 6);
    controller.hoverEnd();
    for (let i = 0; i < 20; i++) manual.advance(16);
    expect(progress.at(-1)?.progress).toBe(0);
  });

  test("a click on a furled edge is the same turn carrying on: progress never drops to 0", async () => {
    const { controller, manual, progress } = setup();
    controller.hover({ x: 470, y: 150 });
    for (let i = 0; i < 20; i++) manual.advance(16);
    controller.pointerDown({ x: 470, y: 150 });
    controller.pointerUp({ x: 470, y: 150 });
    for (let i = 0; i < 100; i++) manual.advance(16);
    await Promise.resolve();
    expect(controller.page).toBe(2);
    expect(progress.map((p) => p.progress)).not.toContain(0);
    expect(progress.at(-1)?.progress).toBe(1);
  });

  test("a turn replaced by another is closed on 0 before the new one reports", () => {
    const { controller, manual, progress } = setup({ startPage: 2 });
    controller.hover({ x: 470, y: 30 });
    for (let i = 0; i < 20; i++) manual.advance(16);
    progress.length = 0;
    void controller.flipPrev(FlipCorner.top);
    expect(progress[0]).toEqual({ from: 2, to: 4, direction: "forward", progress: 0 });
    expect(progress[1]).toMatchObject({ from: 2, to: 0, direction: "back" });
  });

  test("a turn cut short by a resize is closed on 0", () => {
    const { controller, progress } = setup({ size: "stretch" });
    controller.pointerDown({ x: 470, y: 40 });
    controller.pointerDrag({ x: 330, y: 120 });
    const options = resolveOptions({ width: 250, height: 350, size: "stretch" });
    controller.setLayout(computeLayout(600, 420, options));
    expect(progress.at(-1)?.progress).toBe(0);
  });

  test("a turn under way when the book is destroyed is closed on 0", () => {
    const { controller, manual, progress } = setup();
    void controller.flipNext(FlipCorner.top);
    manual.advance(16);
    controller.destroy();
    expect(progress.at(-1)).toEqual({ from: 0, to: 2, direction: "forward", progress: 0 });
  });

  test("flipTo reports the spread on show as `from`, not the one it jumped beside", async () => {
    const { controller, manual, progress } = setup({ cover: true });
    expect(await settle(controller.flipTo(5, FlipCorner.top), manual)).toBe(true);
    expect(progress.at(-1)).toEqual({ from: 0, to: 5, direction: "forward", progress: 1 });
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
