/**
 * The fold: where a page lands when its corner is dragged to a point.
 *
 * A pure function of the drag point and the page size. This is the kernel that StPageFlip
 * users came for; it derives from `FlipCalculation` (MIT, Oleg Litovski) with the same output
 * for the same input, checked by the parity tests. Differences are deliberate: numbers instead
 * of strings for the page size (so fractional layouts stay exact), a result instead of thrown
 * errors for degenerate positions, and no `null` entries inside clip polygons.
 */
import { FlipCorner, FlipDirection } from "../options.ts";
import {
  angleBetweenLines,
  Collinear,
  clampToCircle,
  distance,
  intersectLinesWithin,
  type Point,
  type Rect,
  type RectPoints,
  rotatePoint,
  type Segment,
} from "./point.ts";

export type FoldInput = {
  readonly direction: FlipDirection;
  readonly corner: FlipCorner;
  readonly pageWidth: number;
  readonly pageHeight: number;
  /** Drag point in active-page coordinates: origin at the page's top-left, x grows toward the outer edge. */
  readonly point: Point;
};

/** Where the fold line meets the page edges. A `null` edge is not crossed. */
export type FoldIntersections = {
  readonly top: Point | null;
  readonly side: Point | null;
  readonly bottom: Point | null;
};

export type Fold = {
  /** Rotation of the flipping page in radians, signed by direction. */
  readonly angle: number;
  /** Where the dragged corner ended up after clamping to what paper can do. */
  readonly position: Point;
  /** 0 at rest, 100 fully turned. */
  readonly progress: number;
  /** Corners of the flipping page after rotation. */
  readonly rect: RectPoints;
  readonly intersections: FoldIntersections;
  /** Visible part of the flipping page, as a polygon in page coordinates. */
  readonly flippingClip: readonly Point[];
  /** Part of the page underneath that the fold reveals. */
  readonly bottomClip: readonly Point[];
  /** Where the flipping page's own origin corner sits. */
  readonly activeCorner: Point;
  readonly bottomPagePosition: Point;
  /** Drop-shadow origin and rotation, or `null` when the fold crosses no usable edges. */
  readonly shadow: { readonly start: Point; readonly angle: number } | null;
};

/**
 * Returns `null` when the point is degenerate (the corner is at rest, or the fold line would
 * coincide with a page edge). Callers keep the previous fold for that frame, as the original did.
 */
export function computeFold(input: FoldInput): Fold | null {
  const { direction, corner, pageWidth, pageHeight } = input;

  const positioned = resolvePosition(input);
  if (positioned === null) return null;
  const { position, angle, rect } = positioned;

  const intersections = intersect(input, position, rect);
  if (intersections === null) return null;
  const { top, side, bottom } = intersections;

  const flippingClip: Point[] = [rect.topLeft];
  if (top) flippingClip.push(top);
  let clipBottom = false;
  if (side === null) {
    clipBottom = true;
  } else {
    flippingClip.push(side);
  }
  if (bottom) flippingClip.push(bottom);
  if (clipBottom || corner === FlipCorner.bottom) flippingClip.push(rect.bottomLeft);

  const bottomClip: Point[] = [];
  if (top) bottomClip.push(top);
  if (corner === FlipCorner.top) {
    bottomClip.push({ x: pageWidth, y: 0 });
  } else {
    if (top !== null) bottomClip.push({ x: pageWidth, y: 0 });
    bottomClip.push({ x: pageWidth, y: pageHeight });
  }
  if (side !== null) {
    // A side hit right next to the top hit would give the polygon a zero-width sliver.
    if (top === null || distance(side, top) >= 10) bottomClip.push(side);
  } else if (corner === FlipCorner.top) {
    bottomClip.push({ x: pageWidth, y: pageHeight });
  }
  if (bottom) bottomClip.push(bottom);
  if (top) bottomClip.push(top);

  const shadowStart = corner === FlipCorner.top ? top : (side ?? top);
  const shadowEnd = shadowStart !== side && side !== null ? side : bottom;
  let shadow: Fold["shadow"] = null;
  if (shadowStart !== null && shadowEnd !== null) {
    const raw = angleBetweenLines(
      [shadowStart, shadowEnd],
      [
        { x: 0, y: 0 },
        { x: pageWidth, y: 0 },
      ],
    );
    shadow = {
      start: shadowStart,
      angle: direction === FlipDirection.forward ? raw : Math.PI - raw,
    };
  }

  return {
    angle: direction === FlipDirection.forward ? -angle : angle,
    position,
    progress: Math.abs(((position.x - pageWidth) / (2 * pageWidth)) * 100),
    rect,
    intersections,
    flippingClip,
    bottomClip,
    activeCorner: direction === FlipDirection.forward ? rect.topLeft : rect.topRight,
    bottomPagePosition: direction === FlipDirection.back ? { x: pageWidth, y: 0 } : { x: 0, y: 0 },
    shadow,
  };
}

type Positioned = { position: Point; angle: number; rect: RectPoints };

/** Clamp the drag point to what the paper allows and derive the page rotation from it. */
function resolvePosition(input: FoldInput): Positioned | null {
  const { corner, pageWidth, pageHeight } = input;

  let position = input.point;
  let geometry = angleAndRect(input, position);
  if (geometry === null) return null;

  // The dragged corner cannot get further from the spine than the page is wide.
  const spineNear = corner === FlipCorner.top ? { x: 0, y: 0 } : { x: 0, y: pageHeight };
  const spineFar = corner === FlipCorner.top ? { x: 0, y: pageHeight } : { x: 0, y: 0 };
  const clamped = clampToCircle(spineNear, pageWidth, position);
  if (clamped !== position) {
    position = clamped;
    geometry = angleAndRect(input, position);
    if (geometry === null) return null;
  }

  // Once the far corner crosses the spine, pin the drag to the page's opposite corner, kept
  // within the page diagonal. The original guarded this with an identity check that never held,
  // so the reassignment is unconditional here too.
  const crossed = corner === FlipCorner.top ? geometry.rect.bottomRight : geometry.rect.topRight;
  const opposite = corner === FlipCorner.top ? geometry.rect.topLeft : geometry.rect.bottomLeft;
  if (crossed.x <= 0) {
    position = clampToCircle(spineFar, Math.sqrt(pageWidth ** 2 + pageHeight ** 2), opposite);
    geometry = angleAndRect(input, position);
    if (geometry === null) return null;
  }

  // The corner is still at rest: nothing to fold.
  if (Math.abs(position.x - pageWidth) < 1 && Math.abs(position.y) < 1) return null;

  return { position, ...geometry };
}

function angleAndRect(
  input: FoldInput,
  position: Point,
): { angle: number; rect: RectPoints } | null {
  const angle = foldAngle(input, position);
  if (angle === null) return null;
  return { angle, rect: pageRect(input, position, angle) };
}

/** Rotation that puts the page corner at `position`, folded around the crease. */
function foldAngle(input: FoldInput, position: Point): number | null {
  const { corner, pageWidth, pageHeight } = input;
  const left = pageWidth - position.x + 1;
  const top = corner === FlipCorner.bottom ? pageHeight - position.y : position.y;

  let angle = 2 * Math.acos(left / Math.sqrt(top * top + left * left));
  if (top < 0) angle = -angle;

  // A page folded almost exactly flat onto itself has no usable fold line.
  const flat = Math.PI - angle;
  if (!Number.isFinite(angle) || (flat >= 0 && flat < 0.003)) return null;

  return corner === FlipCorner.bottom ? -angle : angle;
}

function pageRect(input: FoldInput, position: Point, angle: number): RectPoints {
  const { corner, pageWidth, pageHeight } = input;
  // For the bottom corner the page is modelled above the origin, so its bottom edge is y = 0.
  const dy = corner === FlipCorner.top ? 0 : -pageHeight;
  return {
    topLeft: rotatePoint({ x: 0, y: dy }, position, angle),
    topRight: rotatePoint({ x: pageWidth, y: dy }, position, angle),
    bottomLeft: rotatePoint({ x: 0, y: dy + pageHeight }, position, angle),
    bottomRight: rotatePoint({ x: pageWidth, y: dy + pageHeight }, position, angle),
  };
}

/** Where the fold line and the page's far edge cross the page borders. `null` when degenerate. */
function intersect(input: FoldInput, position: Point, rect: RectPoints): FoldIntersections | null {
  const { corner, pageWidth, pageHeight } = input;
  const bounds: Rect = { left: -1, top: -1, width: pageWidth + 2, height: pageHeight + 2 };
  const topEdge: Segment = [
    { x: 0, y: 0 },
    { x: pageWidth, y: 0 },
  ];
  const rightEdge: Segment = [
    { x: pageWidth, y: 0 },
    { x: pageWidth, y: pageHeight },
  ];
  const bottomEdge: Segment = [
    { x: 0, y: pageHeight },
    { x: pageWidth, y: pageHeight },
  ];

  const top =
    corner === FlipCorner.top
      ? intersectLinesWithin(bounds, [position, rect.topRight], topEdge)
      : intersectLinesWithin(bounds, [rect.topLeft, rect.topRight], topEdge);
  const side =
    corner === FlipCorner.top
      ? intersectLinesWithin(bounds, [position, rect.bottomLeft], rightEdge)
      : intersectLinesWithin(bounds, [position, rect.topLeft], rightEdge);
  const bottom = intersectLinesWithin(bounds, [rect.bottomLeft, rect.bottomRight], bottomEdge);

  if (top === Collinear || side === Collinear || bottom === Collinear) return null;
  return { top, side, bottom };
}
