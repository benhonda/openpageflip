import { expect, test } from "vitest";
import {
  Collinear,
  clampToCircle,
  clipPolygonToHalfPlane,
  intersectLines,
} from "../src/geometry/point.ts";

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

// In portrait the renderer draws a turning page only where it is over the page on show, and a
// fold's flat part is the page on the spine side of its crease.
test("clipPolygonToHalfPlane: keeps the part on the normal's side, and nothing of a polygon that only touches the line", () => {
  const square = [
    { x: -10, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 30 },
    { x: -10, y: 30 },
  ];
  const right = { x: 1, y: 0 };
  expect(clipPolygonToHalfPlane(square, right, 0)).toEqual([
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 30 },
    { x: 0, y: 30 },
  ]);
  expect(clipPolygonToHalfPlane(square, right, -40)).toEqual(square);
  expect(clipPolygonToHalfPlane(square, right, 20)).toEqual([]);
  expect(clipPolygonToHalfPlane(square, right, 50)).toEqual([]);
  // A diagonal cut through (20, 0) and (-10, 30), keeping the side away from (20, 30).
  expect(clipPolygonToHalfPlane(square, { x: -1, y: -1 }, -20)).toEqual([
    { x: -10, y: 0 },
    { x: 20, y: 0 },
    { x: -10, y: 30 },
  ]);
});
