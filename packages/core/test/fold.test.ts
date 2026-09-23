import { expect, test } from "vitest";
import { computeFold } from "../src/geometry/fold.ts";
import { clipPolygonToHalfPlane, type Point } from "../src/geometry/point.ts";
import { FlipCorner, FlipDirection } from "../src/options.ts";

const area = (points: readonly Point[]): number =>
  Math.abs(
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length] ?? a;
      return sum + a.x * b.y - b.x * a.y;
    }, 0),
  ) / 2;

// The renderer draws a lifting page where it still lies flat and the page under it everywhere
// else, so the two parts must make up the page: a gap shows the page underneath through the one
// on top, an overlap hides it.
test("a fold's flat part and the part it reveals make up the page between them", () => {
  const w = 250;
  const h = 350;
  /** The page's outer edges as half-planes: `x <= w`, `y >= 0`, `y <= h`. */
  const pageEdges: readonly (readonly [Point, number])[] = [
    [{ x: -1, y: 0 }, -w],
    [{ x: 0, y: 1 }, 0],
    [{ x: 0, y: -1 }, -h],
  ];
  let folds = 0;
  for (const corner of [FlipCorner.top, FlipCorner.bottom]) {
    for (const direction of [FlipDirection.forward, FlipDirection.back]) {
      for (let x = -w; x <= w; x += 10) {
        for (let y = -h / 2; y <= h * 1.5; y += 10) {
          const fold = computeFold({
            direction,
            corner,
            pageWidth: w,
            pageHeight: h,
            point: { x, y },
          });
          if (fold === null) continue;
          folds++;
          // Past the outer edges it reaches beyond the page, for a border; within it, it is exact.
          const flat = pageEdges.reduce(
            (points, [normal, offset]) => clipPolygonToHalfPlane(points, normal, offset),
            fold.flatClip,
          );
          expect(Math.abs(area(flat) + area(fold.bottomClip) - w * h) / (w * h)).toBeLessThan(1e-3);
        }
      }
    }
  }
  expect(folds).toBeGreaterThan(10_000);
});
