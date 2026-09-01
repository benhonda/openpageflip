"use client";

import {
  type Book,
  type BookEvents,
  type BookOptions,
  createBook,
  FlipCorner,
} from "@openpageflip/core";
import {
  Children,
  type CSSProperties,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { Page, type PageProps } from "./Page.tsx";

/** `onFlip`, `onChangeState`, ... one prop per core event, typed from the core's event map. */
type EventProps = {
  [K in keyof BookEvents as `on${Capitalize<K>}`]?: (event: BookEvents[K]) => void;
};

export type FlipBookProps = Omit<BookOptions, "pages"> &
  EventProps & {
    /** The book's API, available from the moment the component mounts. */
    ref?: Ref<Book>;
    /** Each child is a page. Use `Page` to mark hard pages or style the page element. */
    children: ReactNode;
    /** Controlled page: when it changes, the book flips there. Pair with `onFlip`. */
    page?: number;
    className?: string;
    style?: CSSProperties;
  };

const PAGE_ATTR = "data-opf-page";

/** Page elements rendered by this component, in order, skipping the core's transient clone. */
function collectPages(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(`:scope > [${PAGE_ATTR}]:not([data-opf-clone])`),
  );
}

function sameElements(a: readonly HTMLElement[], b: readonly HTMLElement[]): boolean {
  return a.length === b.length && a.every((el, i) => el === b[i]);
}

function renderPage(child: ReactNode): ReactElement | null {
  if (child === null || child === undefined || typeof child === "boolean") return null;
  if (isValidElement<PageProps>(child) && child.type === Page) {
    const { density, children, ...rest } = child.props;
    return (
      <div {...rest} {...{ [PAGE_ATTR]: "" }} data-density={density}>
        {children}
      </div>
    );
  }
  return <div {...{ [PAGE_ATTR]: "" }}>{child}</div>;
}

export function FlipBook({
  ref,
  children,
  page,
  className,
  style,
  onInit,
  onUpdate,
  onFlip,
  onChangeState,
  onChangeOrientation,
  ...options
}: FlipBookProps): ReactElement {
  const container = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const pagesRef = useRef<HTMLElement[]>([]);

  // Callbacks and the easing function are read live, so new closures each render do not rebuild the book.
  const latest = useRef({
    onInit,
    onUpdate,
    onFlip,
    onChangeState,
    onChangeOrientation,
    easing: options.easing,
  });
  useLayoutEffect(() => {
    latest.current = {
      onInit,
      onUpdate,
      onFlip,
      onChangeState,
      onChangeOrientation,
      easing: options.easing,
    };
  });

  // Everything else about the book is fixed at creation, so a change means a new book.
  const { easing: _easing, startPage, ...settings } = options;
  const settingsKey = JSON.stringify(settings);
  const initialPage = page ?? startPage;

  // `initialPage` only seeds a new book; the controlled `page` effect below handles changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: settingsKey is the serialised settings
  useLayoutEffect(() => {
    const el = container.current;
    if (el === null) return;
    const pages = collectPages(el);
    pagesRef.current = pages;
    // `settings` is the value from the render that changed `settingsKey`, so it is current here.
    const book = createBook(el, {
      ...settings,
      easing: (t) => latest.current.easing?.(t) ?? t,
      pages,
      // Keep the page a previous book was on when only settings changed.
      startPage: Math.min(bookRef.current?.page ?? initialPage ?? 0, pages.length - 1),
    });
    book.on("init", (e) => latest.current.onInit?.(e));
    book.on("update", (e) => latest.current.onUpdate?.(e));
    book.on("flip", (e) => latest.current.onFlip?.(e));
    book.on("changeState", (e) => latest.current.onChangeState?.(e));
    book.on("changeOrientation", (e) => latest.current.onChangeOrientation?.(e));
    bookRef.current = book;
    return () => {
      book.destroy();
      bookRef.current = null;
    };
  }, [settingsKey]);

  // After every commit: adopt added or removed pages, and re-apply the book's own classes and
  // layout in case React rewrote a page's attributes.
  useLayoutEffect(() => {
    const book = bookRef.current;
    const el = container.current;
    if (book === null || el === null) return;
    const pages = collectPages(el);
    if (sameElements(pages, pagesRef.current)) {
      book.update();
      return;
    }
    pagesRef.current = pages;
    book.setPages(pages);
  });

  useEffect(() => {
    const book = bookRef.current;
    if (book === null || page === undefined || page === book.page) return;
    void book.flipTo(page);
  }, [page]);

  useImperativeHandle(ref, () => handleFor(bookRef), []);

  return (
    <div ref={container} className={className} style={style}>
      {Children.map(children, renderPage)}
    </div>
  );
}

/** A `Book` that always talks to the current instance and says so when there is none. */
function handleFor(bookRef: { current: Book | null }): Book {
  const live = (): Book => {
    if (bookRef.current === null) throw new Error("@openpageflip/react: FlipBook is not mounted");
    return bookRef.current;
  };
  return {
    get page() {
      return live().page;
    },
    get pageCount() {
      return live().pageCount;
    },
    get orientation() {
      return live().orientation;
    },
    get state() {
      return live().state;
    },
    get rect() {
      return live().rect;
    },
    on: (name, listener, options) => live().on(name, listener, options),
    off: (name, listener) => live().off(name, listener),
    flipNext: (corner = FlipCorner.top) => live().flipNext(corner),
    flipPrev: (corner = FlipCorner.top) => live().flipPrev(corner),
    flipTo: (page, corner = FlipCorner.top) => live().flipTo(page, corner),
    turnTo: (page) => live().turnTo(page),
    turnNext: () => live().turnNext(),
    turnPrev: () => live().turnPrev(),
    setPages: (pages) => live().setPages(pages),
    update: () => live().update(),
    destroy: () => live().destroy(),
  };
}
