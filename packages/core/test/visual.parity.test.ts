import { afterEach, describe, expect, test } from "vitest";
import {
  expectVisualParity,
  frames,
  makePages,
  mountOriginal,
  mountOurs,
  type OriginalSetup,
  type OursSetup,
  PAGE,
  type Pos,
  pointer,
  type Rect,
  sleep,
} from "./visual/harness.ts";

/**
 * The published page-flip@2.0.7 is the visual oracle. Each scenario mounts it and this library
 * in identical stages, drives both to the same state, and compares screenshots.
 */

const LANDSCAPE_STAGE = PAGE.width * 2;
const PORTRAIT_STAGE = 300;

let mounted: (OriginalSetup | OursSetup)[] = [];
afterEach(() => {
  for (const setup of mounted) {
    setup.book.destroy();
    setup.stage.remove();
  }
  mounted = [];
});

/** Drive the original through its API and ours through pointer events. */
type Drive = {
  original: (book: OriginalSetup["book"]) => void;
  ours: (container: HTMLElement) => void;
};

type Scenario = {
  name: string;
  stage: number;
  cover?: boolean;
  hard?: number[];
  startPage?: number;
  /** Drive the original through its API and ours through pointer events. */
  drive?: {
    original: (book: OriginalSetup["book"]) => void;
    ours: (container: HTMLElement) => void;
  };
  settle?: number;
  tolerance?: number;
  /** Stage areas left out of the comparison, each a deliberate difference listed in SPEC.md. */
  ignore?: Rect[];
};

/**
 * The original paints a hard page's shadow on the empty side of the stage when a cover opens or
 * the lone last page closes; this library does not (SPEC.md, deliberate differences). What the
 * pages themselves do on that side is compared elsewhere, over a page that is there to receive
 * the shadow: `hard-middle-back` and `hard-forward-past-spine`.
 */
const EMPTY_LEFT: Rect = { x: 0, y: 0, width: PAGE.width, height: PAGE.height };
const EMPTY_RIGHT: Rect = { x: PAGE.width, y: 0, width: PAGE.width, height: PAGE.height };

/**
 * A drag as a pointer makes it: press, a first small move (the original decides direction and
 * corner from that first move), then the destination.
 */
const drag = (from: Pos, to: Pos): Drive => {
  const step = {
    x: from.x + Math.sign(to.x - from.x) * 8,
    y: from.y + Math.sign(to.y - from.y) * 8,
  };
  return {
    original: (book) => {
      book.startUserTouch(from);
      book.userMove(step, false);
      book.userMove(to, false);
    },
    ours: (container) => {
      pointer(container, "pointerdown", from);
      pointer(container, "pointermove", step);
      pointer(container, "pointermove", to);
    },
  };
};

const scenarios: Scenario[] = [
  { name: "landscape-rest", stage: LANDSCAPE_STAGE },
  {
    name: "landscape-forward-top",
    stage: LANDSCAPE_STAGE,
    drive: drag({ x: 470, y: 40 }, { x: 330, y: 120 }),
  },
  {
    name: "landscape-forward-bottom",
    stage: LANDSCAPE_STAGE,
    drive: drag({ x: 480, y: 320 }, { x: 300, y: 250 }),
  },
  {
    name: "landscape-forward-past-spine",
    stage: LANDSCAPE_STAGE,
    drive: drag({ x: 470, y: 40 }, { x: 110, y: 90 }),
  },
  {
    name: "landscape-back-top",
    stage: LANDSCAPE_STAGE,
    startPage: 2,
    drive: drag({ x: 30, y: 40 }, { x: 160, y: 90 }),
  },
  {
    name: "landscape-back-bottom",
    stage: LANDSCAPE_STAGE,
    startPage: 2,
    drive: drag({ x: 20, y: 330 }, { x: 140, y: 300 }),
  },
  { name: "cover-rest", stage: LANDSCAPE_STAGE, cover: true },
  {
    name: "cover-forward-hard",
    stage: LANDSCAPE_STAGE,
    cover: true,
    drive: drag({ x: 470, y: 40 }, { x: 330, y: 100 }),
    ignore: [EMPTY_LEFT],
  },
  {
    name: "cover-forward-hard-past-spine",
    stage: LANDSCAPE_STAGE,
    cover: true,
    drive: drag({ x: 470, y: 40 }, { x: 150, y: 100 }),
    ignore: [EMPTY_LEFT],
  },
  {
    name: "last-page-back-hard",
    stage: LANDSCAPE_STAGE,
    cover: true,
    startPage: 5,
    drive: drag({ x: 30, y: 40 }, { x: 180, y: 100 }),
    ignore: [EMPTY_RIGHT],
  },
  {
    name: "last-page-back-hard-past-spine",
    stage: LANDSCAPE_STAGE,
    cover: true,
    startPage: 5,
    drive: drag({ x: 30, y: 40 }, { x: 350, y: 100 }),
    ignore: [EMPTY_RIGHT],
  },
  {
    name: "hard-middle-back",
    stage: LANDSCAPE_STAGE,
    hard: [2, 3],
    startPage: 2,
    drive: drag({ x: 30, y: 40 }, { x: 180, y: 120 }),
  },
  {
    name: "hard-forward-past-spine",
    stage: LANDSCAPE_STAGE,
    hard: [2, 3],
    startPage: 2,
    drive: drag({ x: 470, y: 40 }, { x: 150, y: 100 }),
  },
  { name: "last-spread-rest", stage: LANDSCAPE_STAGE, startPage: 5 },
  { name: "portrait-rest", stage: PORTRAIT_STAGE },
  {
    name: "portrait-forward",
    stage: PORTRAIT_STAGE,
    drive: drag({ x: 260, y: 60 }, { x: 150, y: 120 }),
  },
  // Direction is decided by where the drag is, not where it started, as in the original.
  {
    name: "portrait-back",
    stage: PORTRAIT_STAGE,
    startPage: 2,
    drive: drag({ x: 40, y: 60 }, { x: 100, y: 120 }),
  },
  {
    // The original's hover lift stops one frame short of its target (its loop skips the final
    // frame), so the rest state after the lift is not comparable. A second hover move puts both
    // corners at an explicit point, which is.
    name: "hover-corner",
    stage: LANDSCAPE_STAGE,
    drive: {
      original: (book) => {
        book.userMove({ x: 470, y: 30 }, false);
        setTimeout(() => book.userMove({ x: 455, y: 45 }, false), 150);
      },
      ours: (container) => {
        pointer(container, "pointermove", { x: 470, y: 30 }, false);
        setTimeout(() => pointer(container, "pointermove", { x: 455, y: 45 }, false), 150);
      },
    },
    settle: 300,
  },
];

describe("visual parity with page-flip@2.0.7", () => {
  for (const scenario of scenarios) {
    test(scenario.name, async () => {
      const hard = scenario.hard ?? [];
      const original = mountOriginal(scenario.stage, makePages(6, hard), {
        cover: scenario.cover ?? false,
      });
      mounted.push(original);
      await frames(3);
      if (scenario.startPage) original.book.turnToPage(scenario.startPage);
      await frames(2);
      scenario.drive?.original(original.book);
      await frames(3);
      if (scenario.settle) await sleep(scenario.settle);

      const ours = mountOurs(scenario.stage, makePages(6, hard), {
        cover: scenario.cover ?? false,
        startPage: scenario.startPage ?? 0,
      });
      mounted.push(ours);
      await frames(2);
      scenario.drive?.ours(ours.container);
      await frames(3);
      if (scenario.settle) await sleep(scenario.settle);

      // Same stage box before we even look at pixels.
      const a = original.stage.getBoundingClientRect();
      const b = ours.stage.getBoundingClientRect();
      expect({ w: b.width, h: b.height }).toEqual({ w: a.width, h: a.height });

      await expectVisualParity(
        scenario.name,
        original.stage,
        ours.stage,
        scenario.tolerance,
        scenario.ignore,
      );
    });
  }
});
