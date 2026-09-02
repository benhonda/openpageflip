import type { Book, BookEvents, BookOptions } from "@openpageflip/core";
import type { FlipBookEventProps, FlipBookProps } from "@openpageflip/react";
import type { FlipSetting, HTMLFlipBookProps, PageFlipEvent, PageFlipMethod } from "./upstream.ts";

/**
 * The migration guide is this data. Each table is a `Record` over the old API's keys with values
 * drawn from the new API's keys, so the type checker fails the build when a name is missing on
 * either side: an upstream option nobody mapped, or one of ours that was renamed. The page under
 * start/migrate.mdx renders it; nothing there repeats a name by hand.
 */

/** Where an old name went. `to: null` means there is no equivalent and the note says what to do. */
export type Moved<To extends string> =
  | { readonly to: To; readonly note?: string }
  | { readonly to: null; readonly note: string };

type MethodKeys<T> = {
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T];
type PropertyKeys<T> = Exclude<keyof T, MethodKeys<T>>;

/** A method that became a method, or a getter that became a plain property. */
export type MovedMethod =
  | Moved<MethodKeys<Book>>
  | { readonly property: PropertyKeys<Book>; readonly note?: string };

export const options: Readonly<Record<keyof FlipSetting, Moved<keyof BookOptions>>> = {
  width: { to: "width" },
  height: { to: "height" },
  size: { to: "size" },
  minWidth: { to: "minWidth" },
  maxWidth: { to: "maxWidth" },
  minHeight: {
    to: null,
    note: "Height follows width by the width:height ratio, so the width bounds are enough.",
  },
  maxHeight: {
    to: null,
    note: "Same as minHeight.",
  },
  startPage: { to: "startPage" },
  flippingTime: { to: "flipDuration" },
  drawShadow: { to: "shadows" },
  maxShadowOpacity: { to: "shadowOpacity" },
  showCover: { to: "cover" },
  usePortrait: {
    to: "layout",
    note: 'usePortrait: false is layout: "spread". The default "auto" picks by container width, and "single" is new.',
  },
  autoSize: { to: "autoSize" },
  startZIndex: {
    to: null,
    note: "Pages are stacked inside the container, so the book no longer needs a z-index base.",
  },
  mobileScrollSupport: {
    to: null,
    note: "The book sets touch-action on itself, so the page scrolls and the book flips without a flag.",
  },
  clickEventForward: {
    to: "ignoreDragOn",
    note: "Clicks on links, buttons and form fields always reach them. ignoreDragOn is the selector that decides which elements never start a flip.",
  },
  useMouseEvents: {
    to: "drag",
    note: "Split three ways: drag, swipe and click each have their own option.",
  },
  swipeDistance: { to: "swipeDistance" },
  showPageCorners: { to: "hoverCorners" },
  disableFlipByClick: {
    to: "click",
    note: 'disableFlipByClick: true is click: "corners". "off" turns clicks off entirely.',
  },
};

export const methods: Readonly<Record<PageFlipMethod, MovedMethod>> = {
  on: {
    to: "on",
    note: "Returns the unsubscribe function, and takes an AbortSignal in its options.",
  },
  off: {
    to: "off",
    note: "Takes the listener as well as the event name; the old off() dropped every listener of that event.",
  },
  destroy: { to: "destroy" },
  update: {
    to: "update",
    note: "Resizes are watched for you; call this after other layout changes.",
  },
  loadFromHTML: {
    to: null,
    note: "The container's children are the pages when createBook runs, or pass the pages option.",
  },
  updateFromHtml: { to: "setPages" },
  loadFromImages: {
    to: null,
    note: "There is no image mode. Put an img element on each page and it renders like any other content.",
  },
  updateFromImages: { to: null, note: "Same as loadFromImages; use setPages with img pages." },
  clear: {
    to: null,
    note: "destroy() restores the DOM; a new book starts from the pages you give it.",
  },
  turnToPrevPage: { to: "turnPrev" },
  turnToNextPage: { to: "turnNext" },
  turnToPage: { to: "turnTo" },
  flipNext: {
    to: "flipNext",
    note: "Resolves when the turn lands, with false when there was nothing to turn to.",
  },
  flipPrev: { to: "flipPrev", note: "Same promise as flipNext." },
  flip: { to: "flipTo", note: "Same promise as flipNext." },
  getPageCount: { property: "pageCount" },
  getCurrentPageIndex: { property: "page" },
  getOrientation: { property: "orientation" },
  getState: { property: "state" },
  getBoundsRect: { property: "rect" },
  getSettings: { to: null, note: "Keep your own options object; the book does not hand it back." },
  getPage: {
    to: null,
    note: "Internal in the old library. The page elements are the ones you passed in.",
  },
  getRender: { to: null, note: "Internal in the old library." },
  getFlipController: { to: null, note: "Internal in the old library." },
  getUI: { to: null, note: "Internal in the old library." },
  getPageCollection: { to: null, note: "Internal in the old library." },
  updateState: { to: null, note: "Internal in the old library; state is read-only from outside." },
  updatePageIndex: { to: null, note: "Internal in the old library; use turnTo or flipTo." },
  updateOrientation: {
    to: null,
    note: "Internal in the old library; the layout option decides orientation.",
  },
  startUserTouch: {
    to: null,
    note: "Internal in the old library; pointer input is handled by the book.",
  },
  userMove: { to: null, note: "Same as startUserTouch." },
  userStop: { to: null, note: "Same as startUserTouch." },
};

/** Event names are unchanged. What changed is the handler's argument, so the note says what to read. */
export const events: Readonly<
  Record<PageFlipEvent, { readonly to: keyof BookEvents; readonly note: string }>
> = {
  init: { to: "init", note: "e.data.page and e.data.mode are now e.page and e.orientation." },
  update: { to: "update", note: "Same shape as init." },
  flip: { to: "flip", note: "e.data is now e.page." },
  changeState: { to: "changeState", note: "e.data is now e.state." },
  changeOrientation: { to: "changeOrientation", note: "e.data is now e.orientation." },
};

/** FlipBook's props that are not core options, and the event props. */
type FlipBookOwnProps = Exclude<keyof FlipBookProps, keyof BookOptions> | keyof FlipBookEventProps;

export const react: Readonly<Record<keyof HTMLFlipBookProps, Moved<FlipBookOwnProps>>> = {
  onInit: { to: "onInit", note: "Handlers get the core event, see the events table." },
  onUpdate: { to: "onUpdate" },
  onFlip: { to: "onFlip" },
  onChangeState: { to: "onChangeState" },
  onChangeOrientation: { to: "onChangeOrientation" },
  className: { to: "className" },
  style: { to: "style" },
  children: {
    to: "children",
    note: "Children are the pages, as before, but they no longer need a ref or forwardRef. Wrap one in Page to make it hard.",
  },
  ref: {
    to: "ref",
    note: "The ref is the Book itself, so ref.current.flipNext() replaces ref.current.pageFlip().flipNext().",
  },
  renderOnlyPageLengthChange: {
    to: null,
    note: "Pages added or removed by React are picked up after every render, and a changed option rebuilds the book on its own.",
  },
};
