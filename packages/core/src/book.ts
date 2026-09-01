import { browserClock, type Clock } from "./animation.ts";
import { FlipController, type Frame } from "./controller.ts";
import { createEmitter, type Emitter } from "./events.ts";
import { attachInput } from "./input.ts";
import { type BookRect, computeLayout, type LayoutResult } from "./layout.ts";
import {
  type BookOptions,
  FlipCorner,
  type FlipState,
  type Orientation,
  resolveOptions,
} from "./options.ts";
import { createPages } from "./pages.ts";
import { buildSpreads } from "./pagination.ts";
import { DomRenderer } from "./render/dom.ts";

export type BookEvents = {
  /** The book is laid out and showing `startPage`. Fires once, after `createBook` returns. */
  init: { readonly page: number; readonly orientation: Orientation };
  /** Pages were replaced with `setPages`. */
  update: { readonly page: number; readonly orientation: Orientation };
  /** A different spread is showing. `page` is the first page of it. */
  flip: { readonly page: number };
  changeState: { readonly state: FlipState };
  changeOrientation: { readonly orientation: Orientation };
};

export type Book = {
  /** First page of the open spread, zero-based. */
  readonly page: number;
  readonly pageCount: number;
  readonly orientation: Orientation;
  readonly state: FlipState;
  readonly rect: BookRect;

  on: Emitter<BookEvents>["on"];
  off: Emitter<BookEvents>["off"];

  /** Animated turns. Resolve with `false` when there is nothing to turn to. */
  flipNext(corner?: FlipCorner): Promise<boolean>;
  flipPrev(corner?: FlipCorner): Promise<boolean>;
  flipTo(page: number, corner?: FlipCorner): Promise<boolean>;
  /** Instant turns. */
  turnTo(page: number): void;
  turnNext(): void;
  turnPrev(): void;

  /** Replace the page elements. Keeps the current page where possible. */
  setPages(pages: Iterable<HTMLElement>): void;
  /** Re-measure the container and redraw. Resizes are handled automatically; call this after other layout changes. */
  update(): void;
  /** Stop everything, drop listeners and observers, and restore the DOM. */
  destroy(): void;
};

export type CreateBookOptions = BookOptions & {
  /** Time and frame source, replaceable in tests. */
  readonly clock?: Clock;
};

export function createBook(container: HTMLElement, userOptions: CreateBookOptions): Book {
  const { clock = browserClock, ...bookOptions } = userOptions;
  const options = resolveOptions(bookOptions);
  const elements = Array.from(bookOptions.pages ?? container.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  );
  if (elements.length === 0) {
    throw new TypeError("@openpageflip/core: createBook needs at least one page element");
  }
  if (options.startPage >= elements.length) {
    throw new TypeError(
      `@openpageflip/core: "startPage" ${options.startPage} is out of range for ${elements.length} pages`,
    );
  }

  const emitter = createEmitter<BookEvents>();
  const renderer = new DomRenderer(container, options);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const measure = (): LayoutResult => {
    // Orientation depends on width only, and the container's height follows orientation when it
    // sizes itself, so settle the aspect ratio before measuring the height.
    const width = container.clientWidth;
    const { orientation } = computeLayout(width, container.clientHeight, options);
    renderer.applyContainerSizing(orientation);
    return computeLayout(width, container.clientHeight, options);
  };

  const buildPages = (els: readonly HTMLElement[]) => {
    // Hard-by-position does not depend on orientation, so landscape is as good as any here.
    const { hardByPosition } = buildSpreads(els.length, "landscape", options.cover);
    return createPages(els, hardByPosition);
  };

  let pages = buildPages(elements);
  renderer.setPages(pages);

  // The controller is headless, so the reduced-motion preference reaches it as a live duration.
  const controller = new FlipController(
    {
      ...options,
      get flipDuration() {
        return reducedMotion.matches ? 0 : options.flipDuration;
      },
    },
    clock,
    {
      onFrame: (frame: Frame) => renderer.render(frame),
      onPage: (page) => emitter.emit("flip", { page }),
      onState: (state) => emitter.emit("changeState", { state }),
    },
    pages,
    measure(),
  );

  const relayout = (): void => {
    const layout = measure();
    if (controller.setLayout(layout)) {
      emitter.emit("changeOrientation", { orientation: layout.orientation });
    }
  };

  // Relayout can change the container's own height (aspect ratio follows orientation), which
  // would re-enter the observer in the same frame; deferring one frame keeps the loop clean.
  let lastSize = { width: container.clientWidth, height: container.clientHeight };
  let pendingRelayout: number | null = null;
  const observer = new ResizeObserver(() => {
    if (pendingRelayout !== null) return;
    pendingRelayout = requestAnimationFrame(() => {
      pendingRelayout = null;
      const size = { width: container.clientWidth, height: container.clientHeight };
      if (size.width === lastSize.width && size.height === lastSize.height) return;
      lastSize = size;
      relayout();
    });
  });
  observer.observe(container);

  const detachInput = attachInput(container, controller, options);

  controller.showPage(options.startPage);
  queueMicrotask(() =>
    emitter.emit("init", { page: controller.page, orientation: controller.currentOrientation }),
  );

  return {
    get page() {
      return controller.page;
    },
    get pageCount() {
      return controller.pageCount;
    },
    get orientation() {
      return controller.currentOrientation;
    },
    get state() {
      return controller.currentState;
    },
    get rect() {
      return controller.bookRect;
    },
    on: emitter.on,
    off: emitter.off,
    flipNext: (corner = FlipCorner.top) => controller.flipNext(corner),
    flipPrev: (corner = FlipCorner.top) => controller.flipPrev(corner),
    flipTo: (page, corner = FlipCorner.top) => controller.flipTo(page, corner),
    turnTo: (page) => controller.showPage(page),
    turnNext: () => controller.showNext(),
    turnPrev: () => controller.showPrev(),
    setPages(next) {
      const els = Array.from(next);
      if (els.length === 0)
        throw new TypeError("@openpageflip/core: setPages needs at least one page element");
      pages = buildPages(els);
      renderer.setPages(pages);
      controller.setPages(pages);
      emitter.emit("update", { page: controller.page, orientation: controller.currentOrientation });
    },
    update: relayout,
    destroy() {
      observer.disconnect();
      if (pendingRelayout !== null) cancelAnimationFrame(pendingRelayout);
      detachInput();
      controller.destroy();
      renderer.destroy();
      emitter.clear();
    },
  };
}
