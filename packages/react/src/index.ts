/**
 * React 19 bindings: `FlipBook`, `Page`, and the core types they use.
 * @module @openpageflip/react
 */
"use client";

export type {
  Book,
  BookEvents,
  BookOptions,
  BookRect,
  FlipCorner,
  FlipState,
  Layout,
  Orientation,
  PageDensity,
} from "@openpageflip/core";
export { FlipBook, type FlipBookEventProps, type FlipBookProps } from "./FlipBook.tsx";
export { Page, type PageProps } from "./Page.tsx";
