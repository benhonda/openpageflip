import { describe, expect, test } from "vitest";
import { computeFold, type Fold, type FoldInput } from "../src/geometry/fold.ts";
import type { Point } from "../src/geometry/point.ts";
import { FlipCorner, FlipDirection } from "../src/options.ts";
import { FlipCorner as OracleCorner, FlipDirection as OracleDirection } from "./oracle/Flip.ts";
import { FlipCalculation } from "./oracle/FlipCalculation.ts";

/**
 * The original StPageFlip fold maths, run live, is the oracle. For every point on a grid that
 * covers the page and its surroundings, the new kernel must either agree with it to floating
 * point precision or reject the same degenerate points.
 */

const SIZES = [
  { pageWidth: 400, pageHeight: 600 },
  { pageWidth: 300, pageHeight: 210 },
] as const;
const STEPS = 33;

function grid(pageWidth: number, pageHeight: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= STEPS; i++) {
    for (let j = 0; j <= STEPS; j++) {
      points.push({
        x: -pageWidth - 20 + ((2 * pageWidth + 40) * i) / STEPS,
        y: -20 + ((pageHeight + 40) * j) / STEPS,
      });
    }
  }
  // Dense patches next to the outer corners: that is where the fold's two edge hits fall within
  // a few pixels of each other and the original's 10px sliver rule in the bottom clip kicks in.
  for (let dx = 0; dx <= 12; dx += 0.5) {
    for (let dy = 0; dy <= 12; dy += 0.5) points.push({ x: pageWidth - dx, y: dy });
  }
  for (let dx = 0; dx <= 60; dx += 0.5) {
    for (let dy = 0; dy <= 3; dy += 0.25) points.push({ x: pageWidth - dx, y: pageHeight - dy });
  }
  // Exact edges and corners are where degenerate handling shows.
  points.push(
    { x: pageWidth, y: 0 },
    { x: pageWidth - 0.5, y: 0.5 },
    { x: pageWidth, y: pageHeight },
    { x: 0, y: 0 },
    { x: 0, y: pageHeight },
    { x: -pageWidth, y: 0 },
    { x: -pageWidth, y: pageHeight },
    { x: pageWidth / 2, y: 0 },
    { x: pageWidth, y: pageHeight / 2 },
  );
  return points;
}

const toOracle = {
  direction: { forward: OracleDirection.FORWARD, back: OracleDirection.BACK },
  corner: { top: OracleCorner.TOP, bottom: OracleCorner.BOTTOM },
} as const;

type OracleResult = {
  ok: boolean;
  angle: number;
  position: Point;
  progress: number;
  rect: Fold["rect"];
  flippingClip: Point[];
  bottomClip: Point[];
  activeCorner: Point;
  bottomPagePosition: Point;
  shadowStart: Point | null;
  /** `undefined` when the original would have thrown on a null point. */
  shadowAngle: number | undefined;
};

function runOracle(input: FoldInput): OracleResult | null {
  const calc = new FlipCalculation(
    toOracle.direction[input.direction],
    toOracle.corner[input.corner],
    String(input.pageWidth),
    String(input.pageHeight),
  );
  if (!calc.calc(input.point)) return null;
  let shadowAngle: number | undefined;
  try {
    shadowAngle = calc.getShadowAngle();
  } catch {
    shadowAngle = undefined;
  }
  const dropNulls = (points: (Point | null)[]): Point[] =>
    points.filter((p): p is Point => p !== null);
  return {
    ok: true,
    angle: calc.getAngle(),
    position: calc.getPosition(),
    progress: calc.getFlippingProgress(),
    rect: calc.getRect(),
    flippingClip: dropNulls(calc.getFlippingClipArea()),
    bottomClip: dropNulls(calc.getBottomClipArea()),
    activeCorner: calc.getActiveCorner(),
    bottomPagePosition: calc.getBottomPagePosition(),
    shadowStart: calc.getShadowStartPoint(),
    shadowAngle,
  };
}

const EPSILON = 1e-9;
function expectPoint(actual: Point | null, expected: Point | null, label: string): void {
  if (expected === null || actual === null) {
    expect(actual, label).toBe(expected);
    return;
  }
  expect(Math.abs(actual.x - expected.x), `${label}.x`).toBeLessThan(EPSILON);
  expect(Math.abs(actual.y - expected.y), `${label}.y`).toBeLessThan(EPSILON);
}
function expectPoints(actual: readonly Point[], expected: readonly Point[], label: string): void {
  expect(actual.length, `${label}.length`).toBe(expected.length);
  for (const [i, p] of actual.entries()) expectPoint(p, expected[i] ?? null, `${label}[${i}]`);
}

describe.each(SIZES)("page $pageWidth x $pageHeight", ({ pageWidth, pageHeight }) => {
  describe.each(Object.values(FlipDirection))("%s", (direction) => {
    describe.each(Object.values(FlipCorner))("%s corner", (corner) => {
      test("matches the original at every grid point", () => {
        const points = grid(pageWidth, pageHeight);
        let agreed = 0;
        let rejected = 0;
        for (const point of points) {
          const input: FoldInput = { direction, corner, pageWidth, pageHeight, point };
          const label = `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`;
          const expected = runOracle(input);
          const actual = computeFold(input);

          if (expected === null) {
            expect(actual, `${label} should be rejected`).toBeNull();
            rejected++;
            continue;
          }
          expect(actual, `${label} should be accepted`).not.toBeNull();
          if (actual === null) continue;

          expect(Math.abs(actual.angle - expected.angle), `${label} angle`).toBeLessThan(EPSILON);
          expect(Math.abs(actual.progress - expected.progress), `${label} progress`).toBeLessThan(
            EPSILON,
          );
          expectPoint(actual.position, expected.position, `${label} position`);
          for (const key of ["topLeft", "topRight", "bottomLeft", "bottomRight"] as const) {
            expectPoint(actual.rect[key], expected.rect[key], `${label} rect.${key}`);
          }
          expectPoints(actual.flippingClip, expected.flippingClip, `${label} flippingClip`);
          expectPoints(actual.bottomClip, expected.bottomClip, `${label} bottomClip`);
          expectPoint(actual.activeCorner, expected.activeCorner, `${label} activeCorner`);
          expectPoint(
            actual.bottomPagePosition,
            expected.bottomPagePosition,
            `${label} bottomPagePosition`,
          );

          if (expected.shadowAngle === undefined) {
            expect(actual.shadow, `${label} shadow should be absent`).toBeNull();
          } else {
            expect(actual.shadow, `${label} shadow should be present`).not.toBeNull();
            expectPoint(
              actual.shadow?.start ?? null,
              expected.shadowStart,
              `${label} shadow.start`,
            );
            expect(
              Math.abs((actual.shadow?.angle ?? Number.NaN) - expected.shadowAngle),
              `${label} shadow.angle`,
            ).toBeLessThan(EPSILON);
          }
          agreed++;
        }
        // Guard against a grid that only exercises the degenerate path.
        expect(agreed).toBeGreaterThan(points.length / 2);
        expect(rejected).toBeGreaterThan(0);
      });
    });
  });
});
