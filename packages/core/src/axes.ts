/**
 * The kernel works in book space: the spine is on the left, x runs across the two pages and y
 * down them. Every binding is book space seen from a different side. A right-bound book is a
 * mirror of it (the spine on the right, read right to left); a top-bound one is a transpose (x
 * and y trade places); a bottom-bound one is both. The controller and the fold geometry never
 * learn which, because layout, pointer input and the renderer map at their edges through the
 * `Axes` for the binding, built here.
 *
 * Two kinds of point meet here. A container point is placed against the container, and mirroring
 * it needs the container's size. An element-local point is placed against the element's own
 * box (transform origins, clip polygons), and mirroring it needs the element's width instead:
 * the element still lays its content out left to right on screen, so its book-space right edge
 * becomes its screen-space left edge.
 */
import type { Point } from "./geometry/point.ts";
import { Binding } from "./options.ts";

export type Size = { readonly width: number; readonly height: number };

/** A side of the screen a book-space side lands on. */
export type ScreenSide = "left" | "right" | "top" | "bottom";

export type Axes = {
  /** Pages are stacked along the height rather than the width. */
  readonly vertical: boolean;
  /** Screen container point to book space. */
  readonly toBook: (p: Point) => Point;
  /** Book container point to the screen. */
  readonly toScreen: (p: Point) => Point;
  /** A size, either way. */
  readonly size: (s: Size) => Size;
  /** An element-local point, for an element `width` wide in book space. */
  readonly local: (p: Point, width: number) => Point;
  /** A rotation in book space as seen on screen; each reflection reverses its sense. */
  readonly angle: (radians: number) => number;
  /** Where book-space left or right lands on screen: a class name, or a gradient's direction. */
  readonly side: (bookSide: "left" | "right") => ScreenSide;
};

export function isVertical(binding: Binding): boolean {
  return binding === Binding.top || binding === Binding.bottom;
}

export function axesFor(binding: Binding, container: Size): Axes {
  const vertical = isVertical(binding);
  const mirrored = binding === Binding.right || binding === Binding.bottom;
  const swap = (p: Point): Point => (vertical ? { x: p.y, y: p.x } : p);
  const size = (s: Size): Size => (vertical ? { width: s.height, height: s.width } : s);
  const book = size(container);
  const mirror = (p: Point, width: number): Point => (mirrored ? { x: width - p.x, y: p.y } : p);
  return {
    vertical,
    // Screen to book transposes first, then mirrors in book space; book to screen undoes that in
    // the other order. Each step is its own inverse, so the two maps are inverses of each other.
    toBook: (p) => mirror(swap(p), book.width),
    toScreen: (p) => swap(mirror(p, book.width)),
    size,
    local: (p, width) => swap(mirror(p, width)),
    angle: (a) => (vertical === mirrored ? a : -a),
    side: (bookSide) => {
      const x = (bookSide === "right") !== mirrored;
      if (vertical) return x ? "bottom" : "top";
      return x ? "right" : "left";
    },
  };
}
