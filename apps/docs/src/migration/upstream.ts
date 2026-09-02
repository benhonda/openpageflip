/**
 * The public API of the packages this library replaces, copied from their sources so the
 * migration table can be typed against it. Both projects have had no commit since April 2021,
 * so this copy does not go stale; the versions named here are the last ones published.
 *
 * - page-flip@2.0.7: src/Settings.ts (`FlipSetting`), src/PageFlip.ts (the public methods),
 *   and the `trigger(...)` calls in src/PageFlip.ts (the event names).
 * - react-pageflip@2.0.3: src/html-flip-book/settings.ts (`IEventProps`) and index.tsx
 *   (`HTMLFlipBook`'s own props and its ref).
 *
 * Only the names and shapes matter to the table; the doc comments are the originals'.
 */

/** page-flip's constructor options. Every key is required there and only `width`/`height` matter. */
export type FlipSetting = {
  /** Page number from which to start viewing */
  startPage: number;
  /** Whether the book will be stretched under the parent element or not */
  size: "fixed" | "stretch";
  width: number;
  height: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  /** Draw shadows or not when page flipping */
  drawShadow: boolean;
  /** Flipping animation time */
  flippingTime: number;
  /** Enable switching to portrait mode */
  usePortrait: boolean;
  /** Initial value to z-index */
  startZIndex: number;
  /** If this value is true, the parent element will be equal to the size of the book */
  autoSize: boolean;
  /** Shadow intensity (1: max intensity, 0: hidden shadows) */
  maxShadowOpacity: number;
  /** If this value is true, the first and the last pages will be marked as hard and will be shown in single page mode */
  showCover: boolean;
  /** Disable content scrolling when touching a book on mobile devices */
  mobileScrollSupport: boolean;
  /** Set the forward event of clicking on child elements (buttons, links) */
  clickEventForward: boolean;
  /** Using mouse and touch events to page flipping */
  useMouseEvents: boolean;
  swipeDistance: number;
  /** if this value is true, fold the corners of the book when the mouse pointer is over them. */
  showPageCorners: boolean;
  /** if this value is true, flipping by clicking on the whole book will be locked. Only on corners */
  disableFlipByClick: boolean;
};

/** The public methods of `class PageFlip`, in source order. `on`/`off` come from `EventObject`. */
export type PageFlipMethod =
  | "on"
  | "off"
  | "destroy"
  | "update"
  | "loadFromImages"
  | "loadFromHTML"
  | "updateFromImages"
  | "updateFromHtml"
  | "clear"
  | "turnToPrevPage"
  | "turnToNextPage"
  | "turnToPage"
  | "flipNext"
  | "flipPrev"
  | "flip"
  | "updateState"
  | "updatePageIndex"
  | "updateOrientation"
  | "getPageCount"
  | "getCurrentPageIndex"
  | "getPage"
  | "getRender"
  | "getFlipController"
  | "getOrientation"
  | "getBoundsRect"
  | "getSettings"
  | "getUI"
  | "getState"
  | "getPageCollection"
  | "startUserTouch"
  | "userMove"
  | "userStop";

/** Every event name `PageFlip` triggers. Handlers received `{ data, object }`. */
export type PageFlipEvent = "init" | "update" | "flip" | "changeState" | "changeOrientation";

/** react-pageflip's `HTMLFlipBook` props that are not a `FlipSetting`: its event props and its own. */
export type HTMLFlipBookProps = {
  onFlip: unknown;
  onChangeOrientation: unknown;
  onChangeState: unknown;
  onInit: unknown;
  onUpdate: unknown;
  className: unknown;
  style: unknown;
  children: unknown;
  renderOnlyPageLengthChange: unknown;
  /** The ref exposed `{ pageFlip(): PageFlip }`. */
  ref: unknown;
};
