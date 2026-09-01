import type { Point } from "./geometry/point.ts";
import type { BookRect } from "./layout.ts";
import { FlipDirection } from "./options.ts";

/**
 * Three coordinate spaces meet here: the container (where pointer events land), the book rect,
 * and the active page. Page space has its origin at the page's outer top corner with x growing
 * toward the spine, so a backward flip mirrors x.
 */

export function containerToBook(pos: Point, rect: BookRect): Point {
  return { x: pos.x - rect.left, y: pos.y - rect.top };
}

export function containerToPage(pos: Point, rect: BookRect, direction: FlipDirection): Point {
  const x =
    direction === FlipDirection.forward
      ? pos.x - rect.left - rect.width / 2
      : rect.width / 2 - pos.x + rect.left;
  return { x, y: pos.y - rect.top };
}

export function pageToContainer(pos: Point, rect: BookRect, direction: FlipDirection): Point {
  const x =
    direction === FlipDirection.forward
      ? pos.x + rect.left + rect.width / 2
      : rect.width / 2 - pos.x + rect.left;
  return { x, y: pos.y + rect.top };
}
