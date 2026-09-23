/**
 * Plane geometry primitives for the fold calculation. Pure functions, no DOM.
 *
 * The maths derives from StPageFlip's `Helper` (MIT, Oleg Litovski). Where the original's
 * behaviour is quirky, the quirk is kept and commented, because the renderer's look depends on
 * it and the parity tests in `test/fold.parity.test.ts` hold this module to the original.
 */

export type Point = { readonly x: number; readonly y: number };

/** A line through two points. Used as an infinite line, not a bounded segment. */
export type Segment = readonly [Point, Point];

export type Rect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/** The four corners of a rectangle after rotation, so no longer axis-aligned. */
export type RectPoints = {
  readonly topLeft: Point;
  readonly topRight: Point;
  readonly bottomLeft: Point;
  readonly bottomRight: Point;
};

export function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/** The point `t` of the way from `a` to `b`. */
export function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** A point mirrored across the line through a segment. */
export function reflect(point: Point, [a, b]: Segment): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy);
  return { x: 2 * (a.x + t * dx) - point.x, y: 2 * (a.y + t * dy) - point.y };
}

/** Angle between two lines in radians, via the dot product of their normals. */
export function angleBetweenLines(one: Segment, two: Segment): number {
  const a1 = one[0].y - one[1].y;
  const a2 = two[0].y - two[1].y;
  const b1 = one[1].x - one[0].x;
  const b2 = two[1].x - two[0].x;
  return Math.acos(
    (a1 * a2 + b1 * b2) / (Math.sqrt(a1 * a1 + b1 * b1) * Math.sqrt(a2 * a2 + b2 * b2)),
  );
}

/** Inclusive containment test. */
export function isPointInRect(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

/** Rotate `point` by `angle` radians (clockwise in screen space) and translate by `origin`. */
export function rotatePoint(point: Point, origin: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x * cos + point.y * sin + origin.x,
    y: point.y * cos - point.x * sin + origin.y,
  };
}

/**
 * The part of a polygon on the side of a line where `normal · p >= offset` (Sutherland–Hodgman
 * against one edge). Empty when nothing with any area is left, so a polygon that only touches the
 * line does not survive as a sliver.
 */
export function clipPolygonToHalfPlane(
  points: readonly Point[],
  normal: Point,
  offset: number,
): readonly Point[] {
  const side = (p: Point): number => normal.x * p.x + normal.y * p.y - offset;
  const kept: Point[] = [];
  let from = points.at(-1);
  if (from === undefined) return kept;
  for (const to of points) {
    const a = side(from);
    const b = side(to);
    // Strictly across: a vertex on the line is kept as itself, not doubled as a crossing.
    if ((a > 0 && b < 0) || (a < 0 && b > 0)) {
      const t = a / (a - b);
      kept.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
    if (b >= 0) kept.push(to);
    from = to;
  }
  return kept.some((p) => side(p) > 0) ? kept : [];
}

/**
 * Keep `point` inside the circle around `center`. Returns the very same object when it is
 * already inside, so callers can detect clamping by identity.
 *
 * Quirk kept from the original: when the point is left of the y axis the whole x result is
 * negated (not mirrored around the center), and a degenerate line falls back to `y = radius`.
 */
export function clampToCircle(center: Point, radius: number, point: Point): Point {
  if (distance(center, point) <= radius) return point;

  const a = center.x;
  const b = center.y;
  const n = point.x;
  const m = point.y;

  let x = Math.sqrt((radius ** 2 * (a - n) ** 2) / ((a - n) ** 2 + (b - m) ** 2)) + a;
  if (point.x < 0) x *= -1;

  let y = ((x - a) * (b - m)) / (a - n) + b;
  if (a - n + b === 0) y = radius;

  return { x, y };
}

/** Two lines are the same line, so they have no single intersection point. */
export const Collinear: unique symbol = Symbol("collinear");

/**
 * Intersection of two infinite lines: a point, `null` when parallel, or `Collinear` when they
 * coincide. The fold calculation treats `Collinear` as "this pointer position is degenerate".
 */
export function intersectLines(one: Segment, two: Segment): Point | null | typeof Collinear {
  const a1 = one[0].y - one[1].y;
  const a2 = two[0].y - two[1].y;
  const b1 = one[1].x - one[0].x;
  const b2 = two[1].x - two[0].x;
  const c1 = one[0].x * one[1].y - one[1].x * one[0].y;
  const c2 = two[0].x * two[1].y - two[1].x * two[0].y;

  const x = -((c1 * b2 - c2 * b1) / (a1 * b2 - a2 * b1));
  const y = -((a1 * c2 - a2 * c1) / (a1 * b2 - a2 * b1));
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };

  const det1 = a1 * c2 - a2 * c1;
  const det2 = b1 * c2 - b2 * c1;
  return Math.abs(det1 - det2) < 0.1 ? Collinear : null;
}

/** `intersectLines`, additionally dropping a hit that lands outside `bounds`. */
export function intersectLinesWithin(
  bounds: Rect,
  one: Segment,
  two: Segment,
): Point | null | typeof Collinear {
  const hit = intersectLines(one, two);
  if (hit === null || hit === Collinear) return hit;
  return isPointInRect(bounds, hit) ? hit : null;
}
