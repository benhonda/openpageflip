/**
 * Framework-agnostic page-turn engine: `createBook`, its options, events and types.
 * @module @openpageflip/core
 */
export type { Clock } from "./animation.ts";
export { type Book, type BookEvents, type CreateBookOptions, createBook } from "./book.ts";
export type { FlipFrame, Frame, ShadowData } from "./controller.ts";
export type { Emitter, Listener } from "./events.ts";
export * from "./geometry/index.ts";
export { type BookRect, computeLayout, type LayoutOptions, type LayoutResult } from "./layout.ts";
export {
  type BookOptions,
  ClickMode,
  FlipCorner,
  FlipDirection,
  FlipState,
  Layout,
  Orientation,
  PageDensity,
  type ResolvedOptions,
  SizeMode,
} from "./options.ts";
