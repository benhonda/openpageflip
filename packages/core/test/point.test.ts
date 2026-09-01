import { expect, test } from "vitest";
import { Collinear, clampToCircle, intersectLines } from "../src/geometry/point.ts";

// The three outcomes of a line intersection are what the fold relies on to reject degenerate drags.
test("intersectLines: crossing, parallel, and coincident lines", () => {
  const crossing = intersectLines(
    [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ],
  );
  expect(crossing).toEqual({ x: 5, y: 5 });

  const parallel = intersectLines(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    [
      { x: 0, y: 5 },
      { x: 10, y: 5 },
    ],
  );
  expect(parallel).toBeNull();

  const coincident = intersectLines(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    [
      { x: 2, y: 0 },
      { x: 8, y: 0 },
    ],
  );
  expect(coincident).toBe(Collinear);
});

test("clampToCircle returns the same object when nothing needs clamping", () => {
  const inside = { x: 3, y: 4 };
  expect(clampToCircle({ x: 0, y: 0 }, 5, inside)).toBe(inside);
  const outside = clampToCircle({ x: 0, y: 0 }, 5, { x: 6, y: 8 });
  expect(outside).not.toBe(inside);
  expect(Math.hypot(outside.x, outside.y)).toBeCloseTo(5, 9);
});
