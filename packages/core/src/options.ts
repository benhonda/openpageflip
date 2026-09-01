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
