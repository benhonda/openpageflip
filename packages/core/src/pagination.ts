import { FlipDirection, Orientation } from "./options.ts";

/** Page indices shown together. Landscape pairs them; portrait shows one at a time. */
export type Spread = readonly [number] | readonly [number, number];

export type Spreads = {
  readonly spreads: readonly Spread[];
  /** Pages that are hard because of where they sit: the cover, and a last page shown alone. */
  readonly hardByPosition: ReadonlySet<number>;
};

export function buildSpreads(pageCount: number, orientation: Orientation, cover: boolean): Spreads {
  const hardByPosition = new Set<number>();
  const landscape: Spread[] = [];
  let start = 0;
  if (cover && pageCount > 0) {
    hardByPosition.add(0);
    landscape.push([0]);
    start = 1;
  }
  for (let i = start; i < pageCount; i += 2) {
    if (i < pageCount - 1) {
      landscape.push([i, i + 1]);
    } else {
      landscape.push([i]);
      hardByPosition.add(i);
    }
  }
  const portrait: Spread[] = Array.from({ length: pageCount }, (_, i) => [i] as const);
  return { spreads: orientation === Orientation.portrait ? portrait : landscape, hardByPosition };
}

export function spreadIndexOfPage(spreads: readonly Spread[], page: number): number | null {
  const index = spreads.findIndex((spread) => spread[0] === page || spread[1] === page);
  return index === -1 ? null : index;
}

/** Pages lying flat on the left and right for a spread. */
export function staticPages(
  spreads: readonly Spread[],
  orientation: Orientation,
  spreadIndex: number,
  pageCount: number,
): { left: number | null; right: number | null } {
  const spread = spreads[spreadIndex];
  if (spread === undefined) return { left: null, right: null };
  if (spread.length === 2) return { left: spread[0], right: spread[1] };
  // A lone last page in landscape sits on the left, like the back cover of a closed book.
  if (orientation === Orientation.landscape && spread[0] === pageCount - 1)
    return { left: spread[0], right: null };
  return { left: null, right: spread[0] };
}

/**
 * The page that lifts (its back face is what the viewer sees mid-flip) and the page revealed
 * underneath it. `null` when there is no spread in that direction.
 */
export function flipPages(
  spreads: readonly Spread[],
  orientation: Orientation,
  spreadIndex: number,
  direction: FlipDirection,
): { flipping: number; bottom: number } | null {
  const forward = direction === FlipDirection.forward;
  if (orientation === Orientation.portrait) {
    const current = spreads[spreadIndex]?.[0];
    const other = spreads[forward ? spreadIndex + 1 : spreadIndex - 1]?.[0];
    if (current === undefined || other === undefined) return null;
    // Portrait shows the current page lifting away or the previous page coming back.
    return forward ? { flipping: current, bottom: other } : { flipping: other, bottom: other };
  }
  const target = spreads[forward ? spreadIndex + 1 : spreadIndex - 1];
  if (target === undefined) return null;
  if (target.length === 1) return { flipping: target[0], bottom: target[0] };
  return forward
    ? { flipping: target[0], bottom: target[1] }
    : { flipping: target[1], bottom: target[0] };
}
