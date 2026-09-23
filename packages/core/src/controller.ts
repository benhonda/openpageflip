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
import { distance, type Point, reflect } from "./geometry/point.ts";
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
  /** 0..200: how far round a hard page has swung, doubled as the original's hard-page shadow curve expects. */
  readonly progress: number;
};

export type FlipFrame = {
  /**
   * The direction the fold runs. In portrait a turn back runs forward, as the previous page
   * turning off itself in reverse, with that page as `flipping` and on show as `Frame.right`.
   */
  readonly direction: FlipDirection;
  readonly corner: FlipCorner;
  readonly flipping: number;
  /** The page revealed underneath, or `null` when the turn reveals nothing. */
  readonly bottom: number | null;
  readonly fold: Fold;
  /** How far the fold has come, 0..100, running in `direction`. A turn's own progress is `FlipProgress`. */
  readonly progress: number;
  /** Rotation about the spine for hard pages, in degrees. */
  readonly hardAngle: number;
  readonly shadow: ShadowData | null;
  /**
   * When a jump turns a clump of pages at once, the blank sheets under the turning one, nearest
   * first. Empty for a turn of one page.
   */
  readonly sheets: readonly Sheet[];
};

/** A blank sheet of a clump turning together, under the page turning on top of it. */
export type Sheet = {
  /**
   * For a soft page: its flap, in page space. It is pulled a little further over than the one
   * above it, so what shows of it is the edge peeking out from under that one's curl.
   */
  readonly flap: readonly Point[];
  /** For a hard page: how far round it has swung, as `FlipFrame.hardAngle`. */
  readonly hardAngle: number;
};

/** Where a turn is, between the spread it started from and the spread it leads to. */
export type FlipProgress = {
  /** First page of the spread on show when the turn began. */
  readonly from: number;
  /** First page of the spread the turn leads to. */
  readonly to: number;
  readonly direction: FlipDirection;
  /**
   * 0 with the page at rest on `from`, 1 with it landed on `to`; in between, how far across the
   * book the page's corner has come, which for a hard page is how far round it has swung. A turn
   * always ends on exactly 0 (dropped back, or cut short) or 1.
   */
  readonly progress: number;
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
  readonly onProgress: (progress: FlipProgress) => void;
};

type Session = {
  readonly direction: FlipDirection;
  readonly corner: FlipCorner;
  readonly flipping: number;
  readonly bottom: number | null;
  readonly from: number;
  readonly to: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  /**
   * A back turn in portrait, played as the previous page's forward turn run backward. The page
   * coming back starts in the hidden half, so a fold of its own would happen beside the book;
   * run as its forward turn in reverse, the fold starts fully turned (`home`) and uncurls across
   * the page on show to rest (`away`). The fold runs forward (`foldDirection`); the turn is still
   * back, to the pages, events and progress.
   */
  readonly reversed: boolean;
  /** Where along the edge a furl's pointer is: 1 at the top, 0 midway, -1 at the bottom. */
  lean: number;
  fold: Fold | null;
  progress: number;
  hardAngle: number;
  shadow: ShadowData | null;
  /** The turn reached `to`. The fold cannot say so: where a page lands is a degenerate point. */
  landed: boolean;
  /** Sheets turning with this one when a jump passes several spreads; 0 for a single turn. */
  clump: number;
  sheets: readonly Sheet[];
};

/** Pointer travel before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 5;
/**
 * How deep a hover cue folds: the crease sits this far in from the edge it is hovering, the page's
 * outer edge or, for a reversed turn, the spine.
 */
const FURL = 30;
/**
 * How far a hover cue's crease tilts toward the pointer: this much deeper at the end of the edge
 * the pointer is at, as much shallower at the other. Midway along the edge it is parallel.
 */
const TILT = 15;
/**
 * Where a corner sits when a fold starts from rest: `in` from the edge and `down` it. Exactly at
 * rest the fold is degenerate (the crease would lie on the edge), and the kernel treats anything
 * within a pixel of it as rest, so `in` is that pixel. `down` gives a fold reached by pulling
 * straight in a whisker of tilt, under three pixels of drift across a page at furl depth.
 * Exported so the parity suite can start its drags from the same point.
 */
export const REST_NUDGE = { in: 1, down: 0.5 } as const;
/** A jump turns this many sheets at most, one per spread it passes. */
const MOST_SHEETS = 5;
/**
 * How far along the edge each soft sheet of a clump folds past the one above it at its widest, in
 * pixels, where the fold meets the edge of the lifted corner. Its corner peeks out about twice as
 * far.
 */
const SHEET_GAP = 3.5;
/**
 * How much more each deeper soft sheet curls under: this many pixels times the square of how deep
 * it lies, on top of `SHEET_GAP`, so the edges splay out rather than lying evenly apart.
 */
const SHEET_CURL = 1.25;
/** How far behind each sheet of a hard clump swings at its widest, in `progress` (0..100). */
const BOARD_LAG = 1.2;
/** How far into a turn (`progress`, 0..100) a clump has closed up again, well before it lands. */
const CLUMP_CLOSED = 80;
/** Animation paths longer than this take the full `flipDuration`; shorter ones scale down. */
const FULL_FLIP_LENGTH = 1000;
/**
 * No animation is shorter than this fraction of `flipDuration`, however short its path. Scaled
 * alone, a furled edge settling back 60px would take 60ms: a snap, not a settle. The original
 * snapped its hovered corner the same way.
 */
const SHORTEST_FLIP = 0.25;

/** The direction a session's fold is computed in: its own, except a reversed turn runs forward. */
function foldDirection(session: Session): FlipDirection {
  return session.reversed ? FlipDirection.forward : session.direction;
}

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
  /** What the host was last told about a turn, so each change is told once and every turn is closed. */
  private reported: FlipProgress | null = null;

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
    this.drop();
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
    if (resized && !orientationChanged) this.drop();
    if (orientationChanged) {
      this.drop();
      this.orientation = layout.orientation;
      this.rebuildSpreads();
    }
    this.showPage(this.currentPage);
    return orientationChanged;
  }

  /** End any turn and put the book at rest, as a change of pages or size does mid-flip. */
  private drop(): void {
    this.endSession();
    this.setState(FlipState.read);
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
    return this.flipFrom(this.outerEdge(FlipDirection.forward, corner));
  }

  flipPrev(corner: FlipCorner): Promise<boolean> {
    return this.flipFrom(this.outerEdge(FlipDirection.back, corner));
  }

  /** Where a click on a page's outer edge would be, at the given corner. */
  private outerEdge(direction: FlipDirection, corner: FlipCorner): Point {
    return {
      x:
        direction === FlipDirection.forward
          ? this.rect.left + this.rect.pageWidth * 2 - 10
          : this.rect.left + 10,
      y: corner === FlipCorner.top ? 1 : this.rect.height - 2,
    };
  }

  /**
   * Jumps to the spread beside the target without animation, then animates the last turn. The
   * static pages keep showing the current spread until that turn lands, so the page on show turns
   * straight onto the target. Past more than one spread it turns as a clump: a few sheets, one per
   * spread passed up to `MOST_SHEETS`, that fan out behind it (see `clumpSheets`).
   */
  flipTo(page: number, corner: FlipCorner): Promise<boolean> {
    // A running flip lands first, so the target is measured from where the book actually is.
    this.tween?.finish();
    const target = spreadIndexOfPage(this.spreads, page);
    if (target === null || target === this.spreadIndex) return Promise.resolve(false);
    const passed = Math.abs(target - this.spreadIndex);
    const clump = passed > 1 ? Math.min(MOST_SHEETS, passed) : 0;
    const direction = target > this.spreadIndex ? FlipDirection.forward : FlipDirection.back;
    this.spreadIndex = direction === FlipDirection.forward ? target - 1 : target + 1;
    this.syncCurrentPage();
    return this.flipFrom(this.outerEdge(direction, corner), clump);
  }

  private syncCurrentPage(): void {
    const spread = this.spreads[this.spreadIndex];
    if (spread !== undefined) this.currentPage = spread[0];
  }

  /** Full animated flip starting at a container point, as a click would, carrying `clump` sheets with it. */
  private flipFrom(containerPos: Point, clump = 0): Promise<boolean> {
    // A furl under the pointer lands, and the flip carries on from it. A running flip lands too,
    // which ends its session, so the new flip starts from the settled book.
    if (this.session !== null) this.tween?.finish();
    const held = this.session;
    const session = this.start(containerPos);
    if (session === null) return Promise.resolve(false);
    session.clump = clump;

    this.setState(FlipState.flipping);
    const margin = session.pageHeight / 10;
    const home = this.home(session);
    const heldFold =
      held !== null && held.direction === session.direction && held.corner === session.corner
        ? held.fold
        : null;
    const from = heldFold?.position ?? {
      x: home.x - Math.sign(home.x) * margin,
      y: session.corner === FlipCorner.bottom ? home.y - margin : margin,
    };
    this.applyFold(from);
    return this.animateTo(from, this.away(session), true, true);
  }

  /**
   * Let go of a fold: the turn completes if the corner crossed the spine on its way `away`,
   * otherwise it drops back `home`.
   */
  private release(): Promise<boolean> {
    const session = this.session;
    if (session === null || session.fold === null) return Promise.resolve(false);
    const pos = session.fold.position;
    const turns = session.reversed ? pos.x >= 0 : pos.x <= 0;
    return this.animateTo(pos, turns ? this.away(session) : this.home(session), turns, true);
  }

  /**
   * Resolves with whether the page turned. A cancelled animation resolves with `false`. A `to`
   * function is read every frame, so a hover cue can follow the pointer on its way in.
   */
  private animateTo(
    from: Point,
    to: Point | (() => Point),
    turn: boolean,
    reset: boolean,
  ): Promise<boolean> {
    this.tween?.finish();
    const target = typeof to === "function" ? to : () => to;
    const initial = target();
    const length = Math.max(Math.abs(initial.x - from.x), Math.abs(initial.y - from.y));
    const duration =
      Math.max(SHORTEST_FLIP, Math.min(1, length / FULL_FLIP_LENGTH)) * this.options.flipDuration;

    return new Promise((resolve) => {
      this.settleTween = resolve;
      this.tween = startTween(this.clock, {
        duration,
        easing: this.options.easing,
        onFrame: (t) => {
          const { x, y } = target();
          this.applyFold({ x: from.x + (x - from.x) * t, y: from.y + (y - from.y) * t });
        },
        onEnd: () => {
          this.tween = null;
          this.settleTween = null;
          const session = this.session;
          if (session === null) {
            resolve(false);
            return;
          }
          if (turn) {
            session.landed = true;
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
      // Along the edge the furl holds and leans toward the pointer; on its way in it is already
      // aiming there. One that is settling keeps settling: it lands, and the next move furls the
      // edge again.
      if (held) {
        if (this.state !== FlipState.foldCorner) return;
        current.lean = this.leanAt(containerPos, current);
        if (this.tween === null) this.applyFold(this.cuePoint(current));
        return;
      }
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
    session.lean = this.leanAt(containerPos, session);
    const from = this.startPoint(session);
    this.applyFold(from);
    void this.animateTo(from, () => this.cuePoint(session), false, false);
  }

  /** Where along the edge the pointer is, as `Session.lean` counts it. */
  private leanAt(containerPos: Point, session: Session): number {
    const { y } = containerToPage(containerPos, this.rect, foldDirection(session));
    return 1 - 2 * Math.min(1, Math.max(0, y / session.pageHeight));
  }

  /**
   * Where the corner is before the turn: at rest on the page's outer edge, or for a reversed turn
   * fully turned, a page's width past the spine.
   */
  private home(session: Session): Point {
    const x = session.reversed ? -session.pageWidth : session.pageWidth;
    return { x, y: session.corner === FlipCorner.bottom ? session.pageHeight : 0 };
  }

  /** Where the corner is once the turn is made: `home` across the spine. */
  private away(session: Session): Point {
    const home = this.home(session);
    return { x: -home.x, y: home.y };
  }

  /** `home`, nudged in and down by `REST_NUDGE` so the fold is not degenerate. */
  private startPoint(session: Session): Point {
    const home = this.home(session);
    const { in: x, down: y } = REST_NUDGE;
    return {
      x: home.x - Math.sign(home.x) * x,
      y: session.corner === FlipCorner.bottom ? home.y - y : y,
    };
  }

  /**
   * Where the corner goes for a hover cue: folded over a crease `FURL` px in from the edge being
   * hovered, so the page furls at its outer edge or, reversed, uncurls a strip over the spine.
   * The crease tilts by the lean, so the fold is deeper at the pointer's end of the edge. The
   * corner is nudged in like `startPoint`, so the fold is not degenerate when it is parallel.
   */
  private cuePoint(session: Session): Point {
    const { pageWidth: w, pageHeight: h, reversed } = session;
    const crease = reversed ? FURL : w - FURL;
    // Deeper means further from the edge: toward the spine for a furl, away from it reversed.
    const tilt = TILT * session.lean * (reversed ? 1 : -1);
    const bottom = session.corner === FlipCorner.bottom;
    // The crease folds the corner over from where it rests, which for a reversed turn is `away`.
    const { x, y } = reflect({ x: w, y: bottom ? h : 0 }, [
      { x: crease + tilt, y: 0 },
      { x: crease - tilt, y: h },
    ]);
    return { x, y: y + (bottom ? -REST_NUDGE.down : REST_NUDGE.down) };
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
      const start = this.startPoint(session);
      this.dragBase =
        held === null || heldFold === null || held.direction !== session.direction
          ? start
          : held.corner === session.corner
            ? heldFold.position
            : { x: heldFold.position.x, y: start.y };
      this.setState(FlipState.userFold);
    }
    const session = this.session;
    if (session === null) return;
    const from = containerToPage(this.pressStart, this.rect, foldDirection(session));
    const to = containerToPage(containerPos, this.rect, foldDirection(session));
    // A reversed turn's corner is off stage; what the pointer holds is the crease, which lies
    // midway between the corner and where it rests, so the corner travels twice as far.
    const gain = session.reversed ? 2 : 1;
    this.applyFold({
      x: this.dragBase.x + gain * (to.x - from.x),
      y: this.dragBase.y + gain * (to.y - from.y),
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
      return this.animateTo(session.fold.position, this.away(session), true, true);
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
      // The spread on show, which `flipTo` leaves in place while it jumps beside its target.
      from: this.left ?? this.right ?? this.currentPage,
      to: pair.to,
      pageWidth: this.rect.pageWidth,
      pageHeight: this.rect.height,
      reversed: this.orientation === Orientation.portrait && direction === FlipDirection.back,
      lean: 0,
      fold: null,
      progress: 0,
      hardAngle: 0,
      shadow: null,
      landed: false,
      clump: 0,
      sheets: [],
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
      direction: foldDirection(session),
      corner: session.corner,
      pageWidth: session.pageWidth,
      pageHeight: session.pageHeight,
      point: pagePos,
    });
    if (fold === null) return;

    const { progress } = fold;
    session.fold = fold;
    session.progress = progress;
    // How far round a hard page has swung, 0..100 for flat to flat. In portrait it swings a
    // quarter turn, flat to upright at the spine: past upright it would lie over the hidden half,
    // out of sight, and half the turn would show nothing moving.
    const swing = this.orientation === Orientation.portrait ? progress / 2 : progress;
    session.hardAngle = this.hardAngleAt(session, progress);
    // Soft shadows grow wider and fainter as the turn goes on, and a reversed turn goes on as its
    // fold goes back: shaded by the fold, it would start where a forward turn ends, all but bare.
    const turned = session.reversed ? 100 - progress : progress;
    session.shadow =
      this.options.shadows && fold.shadow !== null
        ? {
            pos: fold.shadow.start,
            angle: fold.shadow.angle,
            width: ((session.pageWidth * 3) / 4) * (turned / 100),
            opacity: ((100 - turned) * (100 * this.options.shadowOpacity)) / 100 / 100,
            direction: foldDirection(session),
            progress: swing * 2,
          }
        : null;
    session.sheets = this.clumpSheets(session, fold);
    this.render();
  }

  /** A hard page's angle about the spine at `progress` (0..100) of its turn. */
  private hardAngleAt(session: Session, progress: number): number {
    const swing = this.orientation === Orientation.portrait ? progress / 2 : progress;
    return (
      (foldDirection(session) === FlipDirection.forward ? 90 : -90) * ((200 - swing * 2) / 100)
    );
  }

  /**
   * The blank sheets of a clump turning together. They fan out as the clump gets going, widest
   * two fifths of the way over, and have closed up again by `CLUMP_CLOSED`, so it lands as one.
   * The clump folds over as a whole, so under the page on top each soft sheet folds a little
   * further over than the one above it, and curls a little further under (`SHEET_CURL`): its flap
   * peeks out along that one's curled edge, most at the corner and tapering to nothing at the far
   * end of the fold. A hard one swings a little behind.
   */
  private clumpSheets(session: Session, lead: Fold): readonly Sheet[] {
    if (session.clump === 0) return [];
    const { pageWidth: w, pageHeight: h, corner } = session;
    const fan = Math.sin(Math.PI * Math.min(1, lead.progress / CLUMP_CLOSED));
    const lifted = { x: w, y: corner === FlipCorner.bottom ? h : 0 };
    // Where the turning page's fold meets the edge the lifted corner is on, and its far end.
    const { top, side, bottom } = lead.intersections;
    const near = corner === FlipCorner.bottom ? bottom : top;
    const far = corner === FlipCorner.bottom ? (top ?? side) : (bottom ?? side);
    const sheets: Sheet[] = [];
    for (let sheet = 1; sheet <= session.clump; sheet++) {
      // Each sheet folds about a line from the same far end, further along the corner's edge
      // toward the spine: it fans out from the corner and follows the page the whole way along.
      const along = fan * (SHEET_GAP * sheet + SHEET_CURL * sheet * sheet);
      // Moved from the turning page's own corner by what the move of the fold does to a corner,
      // so a sheet closed up lies exactly under it.
      const moved =
        near === null || far === null
          ? null
          : {
              to: reflect(lifted, [{ x: Math.max(1, near.x - along), y: near.y }, far]),
              from: reflect(lifted, [near, far]),
            };
      const fold =
        moved === null
          ? null
          : computeFold({
              direction: foldDirection(session),
              corner,
              pageWidth: w,
              pageHeight: h,
              point: {
                x: lead.position.x + moved.to.x - moved.from.x,
                y: lead.position.y + moved.to.y - moved.from.y,
              },
            });
      sheets.push({
        flap: fold?.flippingClip ?? [],
        hardAngle: this.hardAngleAt(session, Math.max(0, lead.progress - BOARD_LAG * sheet * fan)),
      });
    }
    return sheets;
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
    const folded = session !== null && session.fold !== null ? session : null;
    return {
      rect: this.rect,
      container: this.container,
      orientation: this.orientation,
      left: this.left,
      // A reversed turn is the page coming back turning forward off itself, so it is the page on
      // show, with the page it covers underneath.
      right: folded?.reversed ? folded.flipping : this.right,
      flip:
        folded !== null && folded.fold !== null
          ? {
              direction: foldDirection(folded),
              corner: folded.corner,
              flipping: folded.flipping,
              bottom: folded.bottom,
              fold: folded.fold,
              progress: folded.progress,
              hardAngle: folded.hardAngle,
              shadow: folded.shadow,
              sheets: folded.sheets,
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
    this.reportProgress();
  }

  /**
   * Progress is read off what was just drawn, so it cannot disagree with the book: a fold is a
   * turn under way, and a turn whose fold is gone without landing is back at rest.
   */
  private reportProgress(): void {
    const session = this.session;
    const now: FlipProgress | null =
      session !== null && session.fold !== null
        ? {
            from: session.from,
            to: session.to,
            direction: session.direction,
            progress: session.landed
              ? 1
              : session.reversed
                ? 1 - session.progress / 100
                : session.progress / 100,
          }
        : null;
    const last = this.reported;
    const sameTurn =
      now !== null &&
      last !== null &&
      now.from === last.from &&
      now.to === last.to &&
      now.direction === last.direction;
    if (sameTurn && now.progress === last.progress) return;
    if (last !== null && !sameTurn && last.progress !== 0 && last.progress !== 1) {
      this.reported = { ...last, progress: 0 };
      this.hooks.onProgress(this.reported);
    }
    if (now === null) return;
    this.reported = now;
    this.hooks.onProgress(now);
  }

  destroy(): void {
    this.endSession();
    // Nothing is drawn again, so a turn that was under way is closed here.
    this.reportProgress();
  }
}
