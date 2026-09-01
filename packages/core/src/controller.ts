/**
 * The headless heart of the book: which spread is open, what a pointer is doing to a corner,
 * and where the flip animation is. It knows nothing about the DOM; it hands `Frame`s to a
 * renderer. The behaviour (corner detection, hover fold, drop thresholds, animation paths)
 * is the original's, so the book feels the same.
 */
import { type Clock, startTween, type Tween } from "./animation.ts";
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
/** How far a hovered corner lifts. */
const HOVER_LIFT = 50;
/** Animation paths longer than this take the full `flipDuration`; shorter ones scale down. */
const FULL_FLIP_LENGTH = 1000;

export class FlipController {
  private pages: PageModel[];
  private spreads: readonly Spread[] = [];
  private spreadIndex = 0;
  private currentPage = 0;
  private orientation: Orientation;
  private rect: BookRect;
  private left: number | null = null;
  private right: number | null = null;

  private state: FlipState = FlipState.read;
  private session: Session | null = null;
  private tween: Tween | null = null;
  /** Settles the promise of the running animation when it is cut short. */
  private settleTween: ((turned: boolean) => void) | null = null;

  private pressStart: Point | null = null;
  private dragged = false;

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
    this.rect = layout.rect;
    const orientationChanged = layout.orientation !== this.orientation;
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
    if (index === null) return;
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
    if (spread !== undefined) this.currentPage = spread[0];
    this.render();
    this.hooks.onPage(this.currentPage);
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
    if (this.session !== null) this.tween?.finish();
    const session = this.start(containerPos);
    if (session === null) return Promise.resolve(false);

    this.setState(FlipState.flipping);
    const { pageWidth, pageHeight } = session;
    const margin = pageHeight / 10;
    const yStart = session.corner === FlipCorner.bottom ? pageHeight - margin : margin;
    const yDest = session.corner === FlipCorner.bottom ? pageHeight : 0;
    const from = { x: pageWidth - margin, y: yStart };
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
    const duration = Math.min(1, length / FULL_FLIP_LENGTH) * this.options.flipDuration;

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
    const { pageWidth, height } = this.rect;

    if (!this.isOnCorner(containerPos)) {
      if (this.session === null) return;
      this.setState(FlipState.read);
      this.tween?.finish();
      void this.release();
      return;
    }

    if (this.session !== null) {
      this.applyFold(containerToPage(containerPos, this.rect, this.session.direction));
      return;
    }
    const session = this.start(containerPos);
    if (session === null) return;
    this.setState(FlipState.foldCorner);
    this.applyFold({ x: pageWidth - 1, y: 1 });
    const yStart = session.corner === FlipCorner.bottom ? height - 1 : 1;
    const yDest = session.corner === FlipCorner.bottom ? height - HOVER_LIFT : HOVER_LIFT;
    void this.animateTo(
      { x: pageWidth - 1, y: yStart },
      { x: pageWidth - HOVER_LIFT, y: yDest },
      false,
      false,
    );
  }

  /** The mouse left the book: drop any hovered corner. */
  hoverEnd(): void {
    if (this.state !== FlipState.foldCorner) return;
    this.setState(FlipState.read);
    this.tween?.finish();
    void this.release();
  }

  pointerDown(containerPos: Point): void {
    this.pressStart = containerPos;
    this.dragged = false;
  }

  /** A pressed pointer moved. Starts a drag once it travels past the click threshold. */
  pointerDrag(containerPos: Point): void {
    if (this.pressStart === null || !this.options.drag) return;
    if (!this.dragged && distance(this.pressStart, containerPos) <= DRAG_THRESHOLD) return;
    this.dragged = true;
    // Direction and corner come from where the press started, so a fast drag across the spine
    // cannot flip the wrong way. (The original decided from the first move instead.)
    const session = this.session ?? this.start(this.pressStart);
    if (session === null) return;
    this.setState(FlipState.userFold);
    this.applyFold(containerToPage(containerPos, this.rect, session.direction));
  }

  /** The pointer was released. A press without a drag is a click. */
  pointerUp(containerPos: Point): void {
    if (this.pressStart === null) return;
    this.pressStart = null;
    if (this.dragged) {
      void this.release();
      return;
    }
    this.click(containerPos);
  }

  /** The browser took the pointer (a scroll, for instance): drop the corner, no click. */
  pointerCancel(): void {
    if (this.pressStart === null) return;
    this.pressStart = null;
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
    if (this.options.click === ClickMode.off) return;
    if (this.options.click === ClickMode.corners && !this.isOnCorner(containerPos)) return;
    void this.flipFrom(containerPos);
  }

  // ---- the flip session -----------------------------------------------------------------------

  /** Decide direction and corner from where the pointer is, and pick the pages that move. */
  private start(containerPos: Point): Session | null {
    this.endSession();
    const bookPos = containerToBook(containerPos, this.rect);
    const direction = this.directionAt(bookPos);
    const corner = bookPos.y >= this.rect.height / 2 ? FlipCorner.bottom : FlipCorner.top;

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

  private endSession(): void {
    this.tween?.cancel();
    this.tween = null;
    this.settleTween?.(false);
    this.settleTween = null;
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

  private isOnCorner(containerPos: Point): boolean {
    const { pageWidth, height, width } = this.rect;
    const reach = Math.sqrt(pageWidth ** 2 + height ** 2) / 5;
    const p = containerToBook(containerPos, this.rect);
    return (
      p.x > 0 &&
      p.y > 0 &&
      p.x < width &&
      p.y < height &&
      (p.x < reach || p.x > width - reach) &&
      (p.y < reach || p.y > height - reach)
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

  private render(): void {
    this.hooks.onFrame(this.frame());
  }

  destroy(): void {
    this.endSession();
  }
}
