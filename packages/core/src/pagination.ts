import { Orientation } from "./options.ts";

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

/** The pages one leaf shows as it turns from one spread to another. */
export type LeafPages = {
  /** The face it lifts from, lying on the side it leaves. */
  readonly front: number;
  /** The face that comes over (the back of the leaf, seen mid-flip). */
  readonly flipping: number;
  /** The page revealed underneath it, or `null` when the turn reveals nothing: a turn onto a page shown alone. */
  readonly bottom: number | null;
  /** First page of the spread the turn leads to. */
  readonly to: number;
};

/**
 * The leaf that turns from spread `from` to spread `to`. Neighbouring spreads make the book's
 * own leaf; spreads further apart make a leaf with a face from each, so a riffle can show a
 * sample of the pages it passes. `null` when either spread is missing or they are the same.
 */
export function flipPages(
  spreads: readonly Spread[],
  orientation: Orientation,
  pageCount: number,
  from: number,
  to: number,
): LeafPages | null {
  const current = spreads[from];
  const target = spreads[to];
  if (current === undefined || target === undefined || from === to) return null;
  const forward = to > from;
  const first = target[0];
  if (orientation === Orientation.portrait) {
    // Portrait shows the current page lifting away, or the page coming back over it.
    return forward
      ? { front: current[0], flipping: current[0], bottom: first, to: first }
      : { front: first, flipping: first, bottom: current[0], to: first };
  }
  const { left, right } = staticPages(spreads, orientation, from, pageCount);
  const front = forward ? right : left;
  if (front === null) return null;
  if (target.length === 1) return { front, flipping: first, bottom: null, to: first };
  return forward
    ? { front, flipping: target[0], bottom: target[1], to: first }
    : { front, flipping: target[1], bottom: target[0], to: first };
}
