/**
 * Public option vocabularies. Plain `as const` objects instead of enums so they survive
 * `isolatedModules`, `erasableSyntaxOnly`, and consumers who only speak string literals.
 */

/** How many pages are visible at once. `auto` picks by container width. */
export const Layout = { auto: "auto", single: "single", spread: "spread" } as const;
export type Layout = (typeof Layout)[keyof typeof Layout];

/** Reading direction. `rtl` flips the spine to the right for manga and Hebrew/Arabic books. */
export const Direction = { ltr: "ltr", rtl: "rtl" } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

/** Which corner a programmatic flip lifts. */
export const FlipCorner = { top: "top", bottom: "bottom" } as const;
export type FlipCorner = (typeof FlipCorner)[keyof typeof FlipCorner];

/** `hard` pages rotate as a rigid sheet (covers); `soft` pages bend along the fold. */
export const PageDensity = { soft: "soft", hard: "hard" } as const;
export type PageDensity = (typeof PageDensity)[keyof typeof PageDensity];

/** Which way a page is turning: `forward` reads on, `back` returns to the previous spread. */
export const FlipDirection = { forward: "forward", back: "back" } as const;
export type FlipDirection = (typeof FlipDirection)[keyof typeof FlipDirection];

/** What the book is showing: one page (`portrait`) or a two-page spread (`landscape`). */
export const Orientation = { portrait: "portrait", landscape: "landscape" } as const;
export type Orientation = (typeof Orientation)[keyof typeof Orientation];

/** What the book is doing right now. */
export const FlipState = {
  /** Nothing in motion. */
  read: "read",
  /** A corner is lifted because the pointer hovers over it. */
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

/** When a click or tap turns the page. */
export const ClickMode = { anywhere: "anywhere", corners: "corners", off: "off" } as const;
export type ClickMode = (typeof ClickMode)[keyof typeof ClickMode];

export type BookOptions = {
  /** Base page width in CSS pixels. With `size: "stretch"` only the `width:height` ratio matters. */
  readonly width: number;
  /** Base page height in CSS pixels. */
  readonly height: number;
  /** @default "fixed" */
  readonly size?: SizeMode;
  /** Narrowest single page in `stretch` mode; below twice this the book goes portrait. @default 100 */
  readonly minWidth?: number;
  /** Widest single page in `stretch` mode. @default 2000 */
  readonly maxWidth?: number;
  /** @default "auto" */
  readonly layout?: Layout;
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
  /** 0 hides shadows, 1 is full strength. @default 1 */
  readonly shadowOpacity?: number;
  /** Size the container to the book (aspect ratio and max width). @default true */
  readonly autoSize?: boolean;
  /** @default "anywhere" */
  readonly click?: ClickMode;
  /** Let the pointer drag a corner. @default true */
  readonly drag?: boolean;
  /** Turn the page on a quick horizontal swipe. @default true */
  readonly swipe?: boolean;
  /** Minimum swipe travel in CSS pixels. @default 30 */
  readonly swipeDistance?: number;
  /** Lift a corner when the mouse hovers over it. @default true */
  readonly hoverCorners?: boolean;
  /** Pointer events starting on an element matching this selector never start a flip. */
  readonly ignoreDragOn?: string;
  /** Page elements. @default the container's children */
  readonly pages?: Iterable<HTMLElement>;
};

export type ResolvedOptions = Required<Omit<BookOptions, "pages">>;

const DEFAULTS: Omit<ResolvedOptions, "width" | "height"> = {
  size: SizeMode.fixed,
  minWidth: 100,
  maxWidth: 2000,
  layout: Layout.auto,
  cover: false,
  startPage: 0,
  flipDuration: 1000,
  easing: (t) => t,
  shadows: true,
  shadowOpacity: 1,
  autoSize: true,
  click: ClickMode.anywhere,
  drag: true,
  swipe: true,
  swipeDistance: 30,
  hoverCorners: true,
  ignoreDragOn: "a, button, input, textarea, select, [data-opf-no-flip]",
};

function isOneOf<T extends string>(vocabulary: Record<string, T>, value: unknown): value is T {
  return Object.values(vocabulary).includes(value as T);
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
  return options;
}
