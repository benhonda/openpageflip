/**
 * The headless heart of the book: which spread is open, what a pointer is doing to a page, and
 * where the flip animation is. It knows nothing about the DOM; it hands `Frame`s to a renderer.
 * The behaviour (drop thresholds, animation paths) is the original's, so the book feels the
 * same. Two things are ours: hover, click and drag all act on the same zone (see `isHandle`), so
 * the cue never promises what a press would not do; and the cue is the whole edge furling, which
 * a drag then carries on from, moving the fold by the pointer's travel.
 */
import { type Clock, startTween, type Tween } from "./animation.ts";
import type { Size } from "./axes.ts";
import { containerToBook, containerToPage } from "./coords.ts";
import { computeFold, type Fold } from "./geometry/fold.ts";
import { distance, type Point } from "./geometry/point.ts";
import type { BookRect, LayoutResult } from "./layout.ts";
import {
  ClickMode,
  FlipCorner,
  FlipDirection,
  FlipState,
  Orientation,
  PageDensity,
  type ResolvedOptions,
} from "./options.ts";
import type { PageModel } from "./pages.ts";
import {
  buildSpreads,
  flipPages,
  type Spread,
  spreadIndexOfPage,
  staticPages,
} from "./pagination.ts";

export type ShadowData = {
  readonly pos: Point;
  readonly angle: number;
  readonly width: number;
  readonly opacity: number;
  readonly direction: FlipDirection;
  /** 0..200: the original doubled flip progress for its hard-page shadow curve. */
  readonly progress: number;
};

export type FlipFrame = {
  readonly direction: FlipDirection;
  readonly corner: FlipCorner;
  readonly flipping: number;
  readonly bottom: number;
  readonly fold: Fold;
  readonly progress: number;
  /** Rotation about the spine for hard pages, in degrees. */
  readonly hardAngle: number;
  readonly shadow: ShadowData | null;
};

/** Everything a renderer needs to draw one moment of the book. */
export type Frame = {
  readonly rect: BookRect;
  /** The container the rect sits in, as measured on screen. */
  readonly container: Size;
  readonly orientation: Orientation;
  readonly left: number | null;
  readonly right: number | null;
  readonly flip: FlipFrame | null;
};

export type ControllerHooks = {
  readonly onFrame: (frame: Frame) => void;
  readonly onPage: (page: number) => void;
  readonly onState: (state: FlipState) => void;
};

type Session = {
  readonly direction: FlipDirection;
  readonly corner: FlipCorner;
  readonly flipping: number;
  readonly bottom: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  fold: Fold | null;
  progress: number;
  hardAngle: number;
  shadow: ShadowData | null;
};

/** Pointer travel before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 5;
/** How deep a hovered edge furls: the crease sits this far in from the edge. */
const FURL = 30;
/**
 * Where a corner sits when a fold starts from rest: `in` from the edge and `down` it. Exactly at
 * rest the fold is degenerate (the crease would lie on the edge), and the kernel treats anything
 * within a pixel of it as rest, so `in` is that pixel. `down` gives a fold reached by pulling
 * straight in a whisker of tilt, under three pixels of drift across a page at furl depth.
 * Exported so the parity suite can start its drags from the same point.
 */
export const REST_NUDGE = { in: 1, down: 0.5 } as const;
/** Animation paths longer than this take the full `flipDuration`; shorter ones scale down. */
const FULL_FLIP_LENGTH = 1000;
/**
 * No animation is shorter than this fraction of `flipDuration`, however short its path. Scaled
 * alone, a furled edge settling back 60px would take 60ms: a snap, not a settle. The original
 * snapped its hovered corner the same way.
 */
const SHORTEST_FLIP = 0.25;

export class FlipController {
  private pages: PageModel[];
  private spreads: readonly Spread[] = [];
  private spreadIndex = 0;
  private currentPage = 0;
  private orientation: Orientation;
  private rect: BookRect;
  private container: Size;
  private left: number | null = null;
  private right: number | null = null;

  private state: FlipState = FlipState.read;
  private session: Session | null = null;
  private tween: Tween | null = null;
  /** Settles the promise of the running animation when it is cut short. */
  private settleTween: ((turned: boolean) => void) | null = null;

  private pressStart: Point | null = null;
  private dragged = false;
  /** Where the fold was when a drag took hold of it, in page space; the drag moves it from here. */
  private dragBase: Point | null = null;

  private readonly options: ResolvedOptions;
  private readonly clock: Clock;
  private readonly hooks: ControllerHooks;

  constructor(
    options: ResolvedOptions,
    clock: Clock,
    hooks: ControllerHooks,
    pages: PageModel[],
    layout: LayoutResult,
  ) {
    this.options = options;
    this.clock = clock;
    this.hooks = hooks;
    this.pages = pages;
    this.orientation = layout.orientation;
    this.rect = layout.rect;
    this.container = layout.container;
    this.rebuildSpreads();
  }

  // ---- pages and layout ---------------------------------------------------------------------

  get page(): number {
    return this.currentPage;
  }
  get pageCount(): number {
    return this.pages.length;
  }
  get currentState(): FlipState {
    return this.state;
  }
  get currentOrientation(): Orientation {
    return this.orientation;
  }
  get bookRect(): BookRect {
    return this.rect;
  }

  setPages(pages: PageModel[]): void {
    this.endSession();
    this.pages = pages;
    this.rebuildSpreads();
    this.showPage(Math.min(this.currentPage, Math.max(0, pages.length - 1)));
  }

  /** Returns true when the orientation changed, which re-paginates the book. */
  setLayout(layout: LayoutResult): boolean {
    const resized =
      layout.rect.pageWidth !== this.rect.pageWidth || layout.rect.height !== this.rect.height;
    this.rect = layout.rect;
    this.container = layout.container;
    const orientationChanged = layout.orientation !== this.orientation;
    // A fold is computed for one page size; when that changes mid-flip the fold is dropped.
    if (resized && !orientationChanged) this.endSession();
    if (orientationChanged) {
      this.endSession();
      this.orientation = layout.orientation;
      this.rebuildSpreads();
    }
    this.showPage(this.currentPage);
    return orientationChanged;
  }

  private rebuildSpreads(): void {
    const { spreads, hardByPosition } = buildSpreads(
      this.pages.length,
      this.orientation,
      this.options.cover,
    );
    this.spreads = spreads;
    for (const [index, page] of this.pages.entries()) {
      if (hardByPosition.has(index)) {
        page.density = PageDensity.hard;
        page.drawingDensity = PageDensity.hard;
      }
    }
  }

  // ---- navigation without animation ---------------------------------------------------------

  showPage(page: number): void {
    const index = spreadIndexOfPage(this.spreads, page);
    if (index === null) {
      throw new RangeError(
        `@openpageflip/core: page ${page} is out of range (0..${this.pages.length - 1})`,
      );
    }
    this.spreadIndex = index;
    this.showSpread();
  }

  showNext(): void {
    if (this.spreadIndex < this.spreads.length - 1) {
      this.spreadIndex++;
      this.showSpread();
    }
  }

  showPrev(): void {
    if (this.spreadIndex > 0) {
      this.spreadIndex--;
      this.showSpread();
    }
  }

  private showSpread(): void {
    const { left, right } = staticPages(
      this.spreads,
      this.orientation,
      this.spreadIndex,
      this.pages.length,
    );
    this.left = left;
    this.right = right;
    const spread = this.spreads[this.spreadIndex];
    const page = spread === undefined ? this.currentPage : spread[0];
    const changed = page !== this.currentPage;
    this.currentPage = page;
    this.render();
    // Relayouts and redraws re-show the same spread; only a real change is a flip.
    if (changed) this.hooks.onPage(page);
  }

  // ---- animated flips -----------------------------------------------------------------------

  flipNext(corner: FlipCorner): Promise<boolean> {
    return this.flipFrom({
      x: this.rect.left + this.rect.pageWidth * 2 - 10,
      y: corner === FlipCorner.top ? 1 : this.rect.height - 2,
    });
  }

  flipPrev(corner: FlipCorner): Promise<boolean> {
    return this.flipFrom({
      x: this.rect.left + 10,
      y: corner === FlipCorner.top ? 1 : this.rect.height - 2,
    });
  }

  /**
   * Jumps to the spread beside the target without animation, then animates the last turn.
   * The static pages keep showing the current spread until that turn lands.
   */
  flipTo(page: number, corner: FlipCorner): Promise<boolean> {
    // A running flip lands first, so the target is measured from where the book actually is.
    this.tween?.finish();
    const target = spreadIndexOfPage(this.spreads, page);
    if (target === null || target === this.spreadIndex) return Promise.resolve(false);
    if (target > this.spreadIndex) {
      this.spreadIndex = target - 1;
      this.syncCurrentPage();
      return this.flipNext(corner);
    }
    this.spreadIndex = target + 1;
    this.syncCurrentPage();
    return this.flipPrev(corner);
  }

  private syncCurrentPage(): void {
    const spread = this.spreads[this.spreadIndex];
    if (spread !== undefined) this.currentPage = spread[0];
  }

  /** Full animated flip starting at a container point, as a click would. */
  private flipFrom(containerPos: Point): Promise<boolean> {
    // A furl under the pointer lands, and the flip carries on from it. A running flip lands too,
    // which ends its session, so the new flip starts from the settled book.
    if (this.session !== null) this.tween?.finish();
    const held = this.session;
    const session = this.start(containerPos);
    if (session === null) return Promise.resolve(false);

    this.setState(FlipState.flipping);
    const { pageWidth, pageHeight } = session;
    const margin = pageHeight / 10;
    const yStart = session.corner === FlipCorner.bottom ? pageHeight - margin : margin;
    const yDest = session.corner === FlipCorner.bottom ? pageHeight : 0;
    const heldFold =
      held !== null && held.direction === session.direction && held.corner === session.corner
        ? held.fold
        : null;
    const from = heldFold?.position ?? { x: pageWidth - margin, y: yStart };
    this.applyFold(from);
    return this.animateTo(from, { x: -pageWidth, y: yDest }, true, true);
  }

  /** Let go of a dragged corner: complete the turn if it crossed the spine, otherwise drop it back. */
  private release(): Promise<boolean> {
    const session = this.session;
    if (session === null || session.fold === null) return Promise.resolve(false);
    const pos = session.fold.position;
    const y = session.corner === FlipCorner.bottom ? session.pageHeight : 0;
    return pos.x <= 0
      ? this.animateTo(pos, { x: -session.pageWidth, y }, true, true)
      : this.animateTo(pos, { x: session.pageWidth, y }, false, true);
  }

  /** Resolves with whether the page turned. A cancelled animation resolves with `false`. */
  private animateTo(from: Point, to: Point, turn: boolean, reset: boolean): Promise<boolean> {
    this.tween?.finish();
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(Math.abs(dx), Math.abs(dy));
    const duration =
      Math.max(SHORTEST_FLIP, Math.min(1, length / FULL_FLIP_LENGTH)) * this.options.flipDuration;

    return new Promise((resolve) => {
      this.settleTween = resolve;
      this.tween = startTween(this.clock, {
        duration,
        easing: this.options.easing,
        onFrame: (t) => this.applyFold({ x: from.x + dx * t, y: from.y + dy * t }),
        onEnd: () => {
          this.tween = null;
          this.settleTween = null;
          const session = this.session;
          if (session === null) {
            resolve(false);
            return;
          }
          if (turn) {
            if (session.direction === FlipDirection.back) this.showPrev();
            else this.showNext();
          }
          if (reset) {
            this.endSession();
            this.setState(FlipState.read);
            this.render();
          }
          resolve(turn);
        },
      });
    });
  }

  // ---- pointer interaction --------------------------------------------------------------------

  /** Mouse moving over the book without a button down. */
  hover(containerPos: Point): void {
    if (this.state !== FlipState.read && this.state !== FlipState.foldCorner) return;

    const current = this.session;
    if (current !== null) {
      const bookPos = containerToBook(containerPos, this.rect);
      const held = this.isHandle(containerPos) && this.directionAt(bookPos) === current.direction;
      // Along the edge the furl holds, wherever the pointer is on it, and one that is settling
      // keeps settling: it lands, and the next move furls the edge again.
      if (held) return;
      if (this.state === FlipState.foldCorner) {
        // Off the edge: let it settle. A settle already running is left alone; restarting it on
        // every move made the edge stutter and never land.
        this.setState(FlipState.read);
        this.stopTween();
        void this.release();
      }
      return;
    }

    if (!this.isPressable(containerPos)) return;
    const session = this.start(containerPos);
    if (session === null) return;
    this.setState(FlipState.foldCorner);
    const from = this.restPoint(session);
    this.applyFold(from);
    void this.animateTo(from, this.furlPoint(session), false, false);
  }

  /** The corner at rest, nudged in and down by `REST_NUDGE` so the fold is not degenerate. */
  private restPoint(session: Session): Point {
    const { in: x, down: y } = REST_NUDGE;
    return {
      x: session.pageWidth - x,
      y: session.corner === FlipCorner.bottom ? session.pageHeight - y : y,
    };
  }

  /** The edge furled: the corner pulled straight in, so the crease runs parallel to the spine. */
  private furlPoint(session: Session): Point {
    return { x: session.pageWidth - 2 * FURL, y: this.restPoint(session).y };
  }

  /** The mouse left the book: let a furled edge settle. */
  hoverEnd(): void {
    if (this.state !== FlipState.foldCorner) return;
    this.setState(FlipState.read);
    this.stopTween();
    void this.release();
  }

  /**
   * Returns whether the press took hold of a page: it can click or drag a corner, so the caller
   * should keep the browser's own selection away from it. A press elsewhere is still tracked, so
   * a swipe can start anywhere, but it never clicks or folds.
   */
  pointerDown(containerPos: Point): boolean {
    // Pressing during a flip lands it; the press then acts on the settled book.
    if (this.state === FlipState.flipping) this.tween?.finish();
    this.pressStart = containerPos;
    this.dragged = false;
    this.dragBase = null;
    return this.isPressable(containerPos);
  }

  /**
   * A pressed pointer moved. Starts a drag once it travels past the click threshold. The fold
   * moves by the pointer's travel from where it was when the drag took hold: pulled straight in
   * from anywhere on the edge, the whole edge furls; pulled from a corner, it folds across.
   */
  pointerDrag(containerPos: Point): void {
    if (this.pressStart === null) return;
    if (!this.dragged && distance(this.pressStart, containerPos) <= DRAG_THRESHOLD) return;
    // A press that travelled is a drag even when it cannot fold: releasing it must not click.
    this.dragged = true;
    if (!this.options.drag || !this.isHandle(this.pressStart)) return;
    if (this.dragBase === null) {
      // Direction and corner come from where the press started, so a fast drag across the spine
      // cannot flip the wrong way. (The original decided from the first move instead.) A furl
      // under the press, lifting or settling, hands over how far in it got.
      const held = this.session;
      const heldFold = held?.fold ?? null;
      const session = this.start(this.pressStart);
      if (session === null) return;
      const rest = this.restPoint(session);
      this.dragBase =
        held === null || heldFold === null || held.direction !== session.direction
          ? rest
          : held.corner === session.corner
            ? heldFold.position
            : { x: heldFold.position.x, y: rest.y };
      this.setState(FlipState.userFold);
    }
    const session = this.session;
    if (session === null) return;
    const from = containerToPage(this.pressStart, this.rect, session.direction);
    const to = containerToPage(containerPos, this.rect, session.direction);
    this.applyFold({
      x: this.dragBase.x + to.x - from.x,
      y: this.dragBase.y + to.y - from.y,
    });
  }

  /** The pointer was released. A press without a drag is a click. */
  pointerUp(containerPos: Point): void {
    if (this.pressStart === null) return;
    this.pressStart = null;
    this.dragBase = null;
    if (this.dragged) {
      void this.release();
      return;
    }
    this.click(containerPos);
  }

  /** The browser took the pointer (a scroll, for instance): drop the fold, no click. */
  pointerCancel(): void {
    if (this.pressStart === null) return;
    this.pressStart = null;
    this.dragBase = null;
    if (this.dragged) void this.release();
  }

  /** A quick horizontal swipe: turn the page the swipe points at. */
  swipe(direction: FlipDirection, corner: FlipCorner): Promise<boolean> {
    this.pressStart = null;
    const session = this.session;
    if (session !== null && session.fold !== null) {
      if (session.direction !== direction) return this.release();
      const y = corner === FlipCorner.bottom ? session.pageHeight : 0;
      return this.animateTo(session.fold.position, { x: -session.pageWidth, y }, true, true);
    }
    return direction === FlipDirection.forward ? this.flipNext(corner) : this.flipPrev(corner);
  }

  private click(containerPos: Point): void {
    if (this.options.click === ClickMode.off || !this.isHandle(containerPos)) return;
    void this.flipFrom(containerPos);
  }

  // ---- the flip session -----------------------------------------------------------------------

  /** Decide direction and corner from where the pointer is, and pick the pages that move. */
  private start(containerPos: Point): Session | null {
    this.endSession();
    const bookPos = containerToBook(containerPos, this.rect);
    const direction = this.directionAt(bookPos);
    const corner = this.cornerAt(bookPos);

    const canFlip =
      direction === FlipDirection.forward
        ? this.currentPage < this.pages.length - 1
        : this.currentPage >= 1;
    if (!canFlip) return null;

    const pair = flipPages(this.spreads, this.orientation, this.spreadIndex, direction);
    if (pair === null) return null;

    // A soft page beside a hard one turns as a hard sheet for this flip, so the two move as one.
    if (this.orientation === Orientation.landscape) {
      const flipping = this.pages[pair.flipping];
      const neighbour =
        this.pages[direction === FlipDirection.back ? pair.flipping + 1 : pair.flipping - 1];
      if (
        flipping !== undefined &&
        neighbour !== undefined &&
        flipping.density !== neighbour.density
      ) {
        flipping.drawingDensity = PageDensity.hard;
        neighbour.drawingDensity = PageDensity.hard;
      }
    }

    this.session = {
      direction,
      corner,
      flipping: pair.flipping,
      bottom: pair.bottom,
      pageWidth: this.rect.pageWidth,
      pageHeight: this.rect.height,
      fold: null,
      progress: 0,
      hardAngle: 0,
      shadow: null,
    };
    return this.session;
  }

  /** Stop the running animation where it is, settling its promise with "did not turn". */
  private stopTween(): void {
    this.tween?.cancel();
    this.tween = null;
    this.settleTween?.(false);
    this.settleTween = null;
  }

  private endSession(): void {
    this.stopTween();
    this.session = null;
    for (const page of this.pages) page.drawingDensity = page.density;
  }

  /** Move the lifted corner to a page-space point. Degenerate points keep the previous fold. */
  private applyFold(pagePos: Point): void {
    const session = this.session;
    if (session === null) return;
    const fold = computeFold({
      direction: session.direction,
      corner: session.corner,
      pageWidth: session.pageWidth,
      pageHeight: session.pageHeight,
      point: pagePos,
    });
    if (fold === null) return;

    const { progress } = fold;
    session.fold = fold;
    session.progress = progress;
    session.hardAngle =
      (session.direction === FlipDirection.forward ? 90 : -90) * ((200 - progress * 2) / 100);
    session.shadow =
      this.options.shadows && fold.shadow !== null
        ? {
            pos: fold.shadow.start,
            angle: fold.shadow.angle,
            width: ((session.pageWidth * 3) / 4) * (progress / 100),
            opacity: ((100 - progress) * (100 * this.options.shadowOpacity)) / 100 / 100,
            direction: session.direction,
            progress: progress * 2,
          }
        : null;
    this.render();
  }

  private directionAt(bookPos: Point): FlipDirection {
    if (this.orientation === Orientation.portrait) {
      // The visible page is the right half; its inner fifth turns back.
      return bookPos.x - this.rect.pageWidth <= this.rect.width / 5
        ? FlipDirection.back
        : FlipDirection.forward;
    }
    return bookPos.x < this.rect.width / 2 ? FlipDirection.back : FlipDirection.forward;
  }

  private cornerAt(bookPos: Point): FlipCorner {
    return bookPos.y >= this.rect.height / 2 ? FlipCorner.bottom : FlipCorner.top;
  }

  // ---- where a page can be taken hold of --------------------------------------------------------

  /** How far from a page's outer edge, or a corner, still counts: the original's corner reach. */
  private get reach(): number {
    const { pageWidth, height } = this.rect;
    return Math.sqrt(pageWidth ** 2 + height ** 2) / 5;
  }

  /** Book-space x where the visible pages start: in portrait only the right half is shown. */
  private get visibleLeft(): number {
    return this.orientation === Orientation.portrait ? this.rect.pageWidth : 0;
  }

  private isOnPage(bookPos: Point): boolean {
    const { width, height } = this.rect;
    return bookPos.x > this.visibleLeft && bookPos.x < width && bookPos.y > 0 && bookPos.y < height;
  }

  /** The strip along each visible page's outer edge, the full height of the page. */
  private isOnEdge(bookPos: Point): boolean {
    return bookPos.x < this.visibleLeft + this.reach || bookPos.x > this.rect.width - this.reach;
  }

  /**
   * Whether a point is where a page can be taken hold of: the edge strip, or with
   * `click: "anywhere"` the whole page. Hover, click and drag all ask this one question, so a
   * lifted corner never promises what a press would not do.
   */
  private isHandle(containerPos: Point): boolean {
    const p = containerToBook(containerPos, this.rect);
    return this.isOnPage(p) && (this.options.click === ClickMode.anywhere || this.isOnEdge(p));
  }

  /** A handle where a press can actually do something: click, drag, or both. Hover furls nothing elsewhere. */
  private isPressable(containerPos: Point): boolean {
    return (
      this.isHandle(containerPos) && (this.options.drag || this.options.click !== ClickMode.off)
    );
  }

  private setState(state: FlipState): void {
    if (this.state === state) return;
    this.state = state;
    this.hooks.onState(state);
  }

  // ---- output -----------------------------------------------------------------------------------

  frame(): Frame {
    const session = this.session;
    return {
      rect: this.rect,
      container: this.container,
      orientation: this.orientation,
      left: this.left,
      right: this.right,
      flip:
        session !== null && session.fold !== null
          ? {
              direction: session.direction,
              corner: session.corner,
              flipping: session.flipping,
              bottom: session.bottom,
              fold: session.fold,
              progress: session.progress,
              hardAngle: session.hardAngle,
              shadow: session.shadow,
            }
          : null,
    };
  }

  /** Hand the current frame to the renderer again, after something else touched the DOM. */
  redraw(): void {
    this.render();
  }

  private render(): void {
    this.hooks.onFrame(this.frame());
  }

  destroy(): void {
    this.endSession();
  }
}
