/**
 * Public option vocabularies. Plain `as const` objects instead of enums so they survive
 * `isolatedModules`, `erasableSyntaxOnly`, and consumers who only speak string literals.
 */

/**
 * How many pages are visible at once. `auto` shows a spread when two pages fit across the
 * container (side by side, or one above the other for a top-bound book), else one page.
 */
export const Layout = { auto: "auto", single: "single", spread: "spread" } as const;
export type Layout = (typeof Layout)[keyof typeof Layout];

/**
 * Which corner a programmatic flip lifts. Named for a left- or right-bound book; with a top or
 * bottom binding the turning corners are along the outer edge, and `top` is the left one,
 * `bottom` the right.
 */
export const FlipCorner = { top: "top", bottom: "bottom" } as const;
export type FlipCorner = (typeof FlipCorner)[keyof typeof FlipCorner];

/** `hard` pages rotate as a rigid sheet (covers); `soft` pages bend along the fold. */
export const PageDensity = { soft: "soft", hard: "hard" } as const;
export type PageDensity = (typeof PageDensity)[keyof typeof PageDensity];

/** Which way a page is turning: `forward` reads on, `back` returns to the previous spread. */
export const FlipDirection = { forward: "forward", back: "back" } as const;
export type FlipDirection = (typeof FlipDirection)[keyof typeof FlipDirection];

/**
 * Where the spine is. `left` is a book read left to right. `right` is the same book read right
 * to left (a manga): the cover sits on the left, pages turn from the left edge, and a swipe to
 * the right reads on. `top` is a notepad or a wall calendar: pages lift from the bottom edge and
 * turn up. `bottom` is a top-bound book upside down: pages lift from the top edge and turn down,
 * like a flip chart. One geometry, seen from four sides.
 */
export const Binding = { left: "left", right: "right", top: "top", bottom: "bottom" } as const;
export type Binding = (typeof Binding)[keyof typeof Binding];

/** What the book is showing: one page (`portrait`) or a two-page spread (`landscape`). */
export const Orientation = { portrait: "portrait", landscape: "landscape" } as const;
export type Orientation = (typeof Orientation)[keyof typeof Orientation];

/** What the book is doing right now. */
export const FlipState = {
  /** Nothing in motion. */
  read: "read",
  /** A hover cue is showing, because the pointer is where a page can be taken hold of: the edge is furled, or the page that turns back peeks in. */
  foldCorner: "fold_corner",
  /** The user is dragging a corner. */
  userFold: "user_fold",
  /** A flip animation is running. */
  flipping: "flipping",
} as const;
export type FlipState = (typeof FlipState)[keyof typeof FlipState];

/** How the book sizes itself. */
export const SizeMode = {
  /** Pages are exactly `width` x `height` CSS pixels. */
  fixed: "fixed",
  /** Pages scale to the container, keeping the `width:height` ratio, between `minWidth` and `maxWidth`. */
  stretch: "stretch",
} as const;
export type SizeMode = (typeof SizeMode)[keyof typeof SizeMode];

/**
 * Where a page can be taken hold of. Hover, click and drag all use the same zone, so a corner
 * lifts only where a press would act.
 */
export const ClickMode = {
  /** The strip along each page's outer edge, a fifth of the page diagonal wide. */
  edges: "edges",
  /** The whole page. */
  anywhere: "anywhere",
  /** Clicks never turn the page; hover and drag still work from the edges. */
  off: "off",
} as const;
export type ClickMode = (typeof ClickMode)[keyof typeof ClickMode];

export type BookOptions = {
  /** Base page width in CSS pixels. With `size: "stretch"` only the `width:height` ratio matters. */
  readonly width: number;
  /** Base page height in CSS pixels. */
  readonly height: number;
  /** @default "fixed" */
  readonly size?: SizeMode;
  /** Narrowest single page in `stretch` mode. A container narrower than two of these across the spine goes portrait. @default 100 */
  readonly minWidth?: number;
  /** Widest single page in `stretch` mode. @default 2000 */
  readonly maxWidth?: number;
  /** @default "auto" */
  readonly layout?: Layout;
  /** @default "left" */
  readonly binding?: Binding;
  /** Show the first and last pages alone, as hard covers. @default false */
  readonly cover?: boolean;
  /** Zero-based page to open on. @default 0 */
  readonly startPage?: number;
  /** Duration of a full flip in milliseconds. Shorter flips take proportionally less. @default 1000 */
  readonly flipDuration?: number;
  /** Easing for the corner's path, `t` in 0..1. @default linear */
  readonly easing?: (t: number) => number;
  /** @default true */
  readonly shadows?: boolean;
  /** 0 hides shadows, 1 is full strength (the original's look). @default 0.35 */
  readonly shadowOpacity?: number;
  /** Size the container to the book (aspect ratio and max width). @default true */
  readonly autoSize?: boolean;
  /** @default "edges" */
  readonly click?: ClickMode;
  /** Let the pointer drag a page's edge. The fold follows the pointer's travel: pulled straight in it furls the whole edge, pulled from a corner it folds across. @default true */
  readonly drag?: boolean;
  /** Turn the page on a quick touch or pen swipe across the pages (horizontal for a left- or right-bound book, vertical otherwise), from anywhere on it. @default true */
  readonly swipe?: boolean;
  /** Minimum swipe travel in CSS pixels. @default 30 */
  readonly swipeDistance?: number;
  /** Show where a page can be taken hold of when the mouse hovers there: the edge furls, leaning toward the pointer, and in a single-page book the page that turns back peeks in over the spine. @default true */
  readonly hover?: boolean;
  /**
   * Pointer events starting on an element matching this selector never start a flip.
   * `false` turns this off.
   * @default "a, button, input, textarea, select, [data-opf-no-flip]"
   */
  readonly ignoreDragOn?: string | false;
  /** Page elements. @default the container's children */
  readonly pages?: Iterable<HTMLElement>;
};

export type ResolvedOptions = Required<Omit<BookOptions, "pages">>;

const DEFAULTS: Omit<ResolvedOptions, "width" | "height"> = {
  size: SizeMode.fixed,
  minWidth: 100,
  maxWidth: 2000,
  layout: Layout.auto,
  binding: Binding.left,
  cover: false,
  startPage: 0,
  flipDuration: 1000,
  easing: (t) => t,
  shadows: true,
  shadowOpacity: 0.35,
  autoSize: true,
  click: ClickMode.edges,
  drag: true,
  swipe: true,
  swipeDistance: 30,
  hover: true,
  ignoreDragOn: "a, button, input, textarea, select, [data-opf-no-flip]",
};

function isOneOf<T extends string>(vocabulary: Record<string, T>, value: unknown): value is T {
  return Object.values(vocabulary).some((allowed) => allowed === value);
}

/** Fill in defaults and reject options that could only produce a broken book. */
export function resolveOptions(user: BookOptions): ResolvedOptions {
  const { pages: _pages, ...rest } = user;
  const options: ResolvedOptions = { ...DEFAULTS, ...rest };

  const positive = (name: "width" | "height" | "flipDuration" | "minWidth" | "maxWidth") => {
    const value = options[name];
    if (!(Number.isFinite(value) && value > 0)) {
      throw new TypeError(
        `@openpageflip/core: "${name}" must be a positive number, got ${String(value)}`,
      );
    }
  };
  positive("width");
  positive("height");
  positive("flipDuration");
  positive("minWidth");
  positive("maxWidth");
  if (options.maxWidth < options.minWidth) {
    throw new TypeError(
      `@openpageflip/core: "maxWidth" (${options.maxWidth}) is below "minWidth" (${options.minWidth})`,
    );
  }
  if (!isOneOf(SizeMode, options.size))
    throw new TypeError(`@openpageflip/core: unknown "size" ${String(options.size)}`);
  if (!isOneOf(Layout, options.layout))
    throw new TypeError(`@openpageflip/core: unknown "layout" ${String(options.layout)}`);
  if (!isOneOf(Binding, options.binding))
    throw new TypeError(`@openpageflip/core: unknown "binding" ${String(options.binding)}`);
  if (!isOneOf(ClickMode, options.click))
    throw new TypeError(`@openpageflip/core: unknown "click" ${String(options.click)}`);
  if (!(options.shadowOpacity >= 0 && options.shadowOpacity <= 1)) {
    throw new TypeError(
      `@openpageflip/core: "shadowOpacity" must be within 0..1, got ${options.shadowOpacity}`,
    );
  }
  if (!Number.isInteger(options.startPage) || options.startPage < 0) {
    throw new TypeError(
      `@openpageflip/core: "startPage" must be a non-negative integer, got ${options.startPage}`,
    );
  }
  if (options.ignoreDragOn !== false) {
    try {
      document.createElement("div").matches(options.ignoreDragOn);
    } catch {
      throw new TypeError(
        `@openpageflip/core: "ignoreDragOn" is not a valid selector: ${options.ignoreDragOn}`,
      );
    }
  }
  return options;
}
