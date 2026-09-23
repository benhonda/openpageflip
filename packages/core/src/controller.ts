/**
 * The headless heart of the book: which spread is open, what a pointer is doing to a page, and
 * where the flip animation is. It knows nothing about the DOM; it hands `Frame`s to a renderer.
 * The behaviour (drop thresholds, animation paths) is the original's, so the book feels the
 * same. Three things are ours: hover, click and drag all act on the same zone (see `isHandle`), so
 * the cue never promises what a press would not do; the cue is the whole edge furling, which a
 * drag then carries on from, moving the fold by the pointer's travel; and a jump riffles through
 * the leaves between (see `riffle`) rather than cutting to the last turn.
 */
import { type Clock, startTween, type Tween } from "./animation.ts";
import type { Size } from "./axes.ts";
import { containerToBook, containerToPage } from "./coords.ts";
import { computeFold, type Fold } from "./geometry/fold.ts";
import { distance, lerp, type Point, reflect } from "./geometry/point.ts";
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
   * The direction the fold runs. In portrait a turn back runs forward, as the page coming back
   * turning off itself in reverse, with that page as both `front` and `flipping`.
   */
  readonly direction: FlipDirection;
  readonly corner: FlipCorner;
  /**
   * The face the leaf lifts from. Where it has not lifted it lies flat (`fold.flatClip`), over
   * whatever is under it. In portrait it is also `flipping`: the page lifts away from itself.
   */
  readonly front: number;
  /** The face that comes over: the back of the leaf, seen mid-flip. */
  readonly flipping: number;
  /** The page the leaf lifts off, or `null` when there is none (a turn onto a page shown alone). */
  readonly bottom: number | null;
  readonly fold: Fold;
  /** How far the fold has come, 0..100, running in `direction`. A turn's own progress is `FlipProgress`. */
  readonly progress: number;
  /** Rotation about the spine for hard pages, in degrees. */
  readonly hardAngle: number;
  readonly shadow: ShadowData | null;
};

/** Where a turn is, between the spread it started from and the spread it leads to. */
export type FlipProgress = {
  /** First page of the spread on show when the turn began. */
  readonly from: number;
  /** First page of the spread the turn leads to. */
  readonly to: number;
  readonly direction: FlipDirection;
  /**
   * 0 with the book at rest on `from`, 1 with it landed on `to`; in between, how far across the
   * book the page's corner has come, which for a hard page is how far round it has swung. A jump
   * that riffles through several leaves shares the way evenly among them. A turn always ends on
   * exactly 0 (dropped back, or cut short) or 1.
   */
  readonly progress: number;
};

/** Everything a renderer needs to draw one moment of the book. */
export type Frame = {
  readonly rect: BookRect;
  /** The container the rect sits in, as measured on screen. */
  readonly container: Size;
  readonly orientation: Orientation;
  /**
   * The pages lying flat under anything in the air: the spread on show, except that the side the
   * leaves lift from shows the page the lowest of them lifts off.
   */
  readonly left: number | null;
  readonly right: number | null;
  /**
   * The leaves in the air, the one on top first. One for a turn, a furl or a drag; a jump riffles
   * through several, each lifting before the one above it has landed.
   */
  readonly leaves: readonly FlipFrame[];
};

export type ControllerHooks = {
  readonly onFrame: (frame: Frame) => void;
  readonly onPage: (page: number) => void;
  readonly onState: (state: FlipState) => void;
  readonly onProgress: (progress: FlipProgress) => void;
};

/** One leaf in the air, or about to be. */
type Session = {
  readonly direction: FlipDirection;
  readonly corner: FlipCorner;
  readonly front: number;
  readonly flipping: number;
  readonly bottom: number | null;
  /** The spread it lands on. */
  readonly target: number;
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
};

/** A turn as the host sees it: one leaf, or a riffle of several from one spread to another. */
type Turn = {
  /** First page of the spread on show when it began. */
  readonly from: number;
  /** First page of the spread it leads to. */
  readonly to: number;
  readonly direction: FlipDirection;
  /** How many leaves it turns. */
  readonly leaves: number;
  /** How many of them have landed. */
  landed: number;
};

/** One leaf's path through an animation: it lifts `delay` ms in and moves for `duration` ms. */
type Track = {
  readonly leaf: Session;
  readonly from: Point;
  /** Read every frame, so a hover cue can follow the pointer on its way in. */
  readonly to: () => Point;
  readonly delay: number;
  readonly duration: number;
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
/** Animation paths longer than this take the full `flipDuration`; shorter ones scale down. */
const FULL_FLIP_LENGTH = 1000;
/**
 * No animation is shorter than this fraction of `flipDuration`, however short its path. Scaled
 * alone, a furled edge settling back 60px would take 60ms: a snap, not a settle. The original
 * snapped its hovered corner the same way.
 */
const SHORTEST_FLIP = 0.25;
/**
 * A jump turns at most this many leaves. One further riffles through an even sample of the spreads
 * it passes, so every leaf shows real pages and a long jump takes no longer than a short one.
 */
const RIFFLE_LEAVES = 5;
/** Each leaf of a riffle takes this share of the time a turn of its own would. */
const RIFFLE_PACE = 0.6;
/** How finely a leaf's track is searched for the moment its fold first reaches past the spine. */
const CROSSING_STEPS = 64;

/** The direction a session's fold is computed in: its own, except a reversed turn runs forward. */
function foldDirection(session: Session): FlipDirection {
  return session.reversed ? FlipDirection.forward : session.direction;
}

export class FlipController {
  private pages: PageModel[];
  private spreads: readonly Spread[] = [];
  private spreadIndex = 0;
  private currentPage = 0;
  /** The page the host was last told about; a turn tells it once, when it is over. */
  private announcedPage = 0;
  private orientation: Orientation;
  private rect: BookRect;
  private container: Size;
  private left: number | null = null;
  private right: number | null = null;

  private state: FlipState = FlipState.read;
  private turn: Turn | null = null;
  /** The leaves of the turn in the air, in the order they lift. */
  private leaves: Session[] = [];
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

  /** The leaf a pointer works on. Only an animated jump has more than one in the air. */
  private get session(): Session | null {
    return this.leaves[0] ?? null;
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
    this.show(this.currentPage);
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
      if (hardByPosition.has(index)) page.density = PageDensity.hard;
    }
    this.syncDrawingDensity();
  }

  /**
   * A soft page backing a hard one turns as a hard sheet while its leaf is in the air, so the two
   * faces move as one. Every other page is drawn as what it is.
   */
  private syncDrawingDensity(): void {
    for (const page of this.pages) page.drawingDensity = page.density;
    if (this.orientation !== Orientation.landscape) return;
    for (const leaf of this.leaves) {
      const front = this.pages[leaf.front];
      const flipping = this.pages[leaf.flipping];
      if (front !== undefined && flipping !== undefined && front.density !== flipping.density) {
        front.drawingDensity = PageDensity.hard;
        flipping.drawingDensity = PageDensity.hard;
      }
    }
  }

  // ---- navigation without animation ---------------------------------------------------------

  /** An instant turn: whatever is in the air is dropped, and the spread holding `page` shown. */
  showPage(page: number): void {
    this.drop();
    this.show(page);
  }

  showNext(): void {
    if (this.spreadIndex >= this.spreads.length - 1) return;
    this.drop();
    this.spreadIndex++;
    this.showSpread();
  }

  showPrev(): void {
    if (this.spreadIndex <= 0) return;
    this.drop();
    this.spreadIndex--;
    this.showSpread();
  }

  private drop(): void {
    this.endTurn();
    this.setState(FlipState.read);
  }

  private show(page: number): void {
    const index = spreadIndexOfPage(this.spreads, page);
    if (index === null) {
      throw new RangeError(
        `@openpageflip/core: page ${page} is out of range (0..${this.pages.length - 1})`,
      );
    }
    this.spreadIndex = index;
    this.showSpread();
  }

  private showSpread(): void {
    this.placeSpread();
    this.render();
    // A turn tells the host once it is over; a relayout or redraw of the same spread tells nothing.
    if (this.turn === null) this.announce();
  }

  /** Lay the spread at `spreadIndex` flat, without drawing it. */
  private placeSpread(): void {
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
  }

  private announce(): void {
    if (this.currentPage === this.announcedPage) return;
    this.announcedPage = this.currentPage;
    this.hooks.onPage(this.currentPage);
  }

  // ---- animated flips -----------------------------------------------------------------------

  flipNext(corner: FlipCorner): Promise<boolean> {
    return this.flipBy(1, corner);
  }

  flipPrev(corner: FlipCorner): Promise<boolean> {
    return this.flipBy(-1, corner);
  }

  /**
   * Turns to the spread holding `page`. Beside it, that is one turn; further away, the leaves
   * riffle, each lifting as the one above it is halfway over (see `riffle`).
   */
  flipTo(page: number, corner: FlipCorner): Promise<boolean> {
    // A running flip lands first, so the target is measured from where the book actually is.
    this.tween?.finish();
    const target = spreadIndexOfPage(this.spreads, page);
    if (target === null) return Promise.resolve(false);
    return this.riffle(target, corner);
  }

  private flipBy(step: 1 | -1, corner: FlipCorner): Promise<boolean> {
    // A furl under the pointer lands, and the flip carries on from it. A running flip lands too,
    // which ends its turn, so the new flip starts from the settled book.
    this.tween?.finish();
    return this.riffle(this.spreadIndex + step, corner);
  }

  /**
   * Animates the leaves from the spread on show to `target`: one, or up to `RIFFLE_LEAVES`
   * turning between an even sample of the spreads passed. Leaves are timed so that each one's
   * fold reaches past the spine just as the leaf above it lands: the one above covers it until
   * then, and a leaf lies on top once it is down, so neither ever shows through the other.
   */
  private riffle(target: number, corner: FlipCorner): Promise<boolean> {
    const start = this.spreadIndex;
    const passed = Math.abs(target - start);
    if (passed === 0) return Promise.resolve(false);
    const step = Math.sign(target - start);
    const direction = step > 0 ? FlipDirection.forward : FlipDirection.back;
    const count = Math.min(passed, RIFFLE_LEAVES);
    const stops = Array.from(
      { length: count + 1 },
      (_, i) => start + step * Math.round((i * passed) / count),
    );
    const leaves: Session[] = [];
    for (const [i, from] of stops.slice(0, -1).entries()) {
      const leaf = this.leaf(direction, corner, from, stops[i + 1] ?? target);
      if (leaf === null) return Promise.resolve(false);
      leaves.push(leaf);
    }
    const to = this.spreads[target]?.[0];
    if (to === undefined) return Promise.resolve(false);

    const held = this.session;
    const heldFold =
      held !== null && held.direction === direction && held.corner === corner ? held.fold : null;
    this.endTurn();
    this.turn = { from: this.currentPage, to, direction, leaves: count, landed: 0 };
    this.setState(FlipState.flipping);

    const pace = count > 1 ? RIFFLE_PACE : 1;
    const tracks: Track[] = [];
    for (const [i, leaf] of leaves.entries()) {
      const from = (i === 0 ? heldFold?.position : undefined) ?? this.liftPoint(leaf);
      const away = this.away(leaf);
      const duration = this.durationOf(from, away) * pace;
      const above = tracks.at(-1);
      const delay =
        above === undefined
          ? 0
          : Math.max(
              above.delay,
              above.delay + above.duration - duration * this.crossing(leaf, from, away),
            );
      tracks.push({ leaf, from, to: () => away, delay, duration });
    }
    return this.animate(tracks, true, true);
  }

  /**
   * How far into a leaf's track, as a share of its duration, its fold can go without reaching past
   * the spine: the last step searched before it does. Run as a forward turn: a portrait turn back
   * is the same track the other way, and in portrait only the page on show is drawn, so its
   * timing borrows the forward turn's.
   */
  private crossing(leaf: Session, from: Point, to: Point): number {
    const forward = leaf.reversed ? { from: to, to: from } : { from, to };
    for (let i = 1; i < CROSSING_STEPS; i++) {
      const fold = computeFold({
        direction: foldDirection(leaf),
        corner: leaf.corner,
        pageWidth: leaf.pageWidth,
        pageHeight: leaf.pageHeight,
        point: lerp(forward.from, forward.to, this.options.easing(i / CROSSING_STEPS)),
      });
      if (fold?.flippingClip.some((p) => p.x < 0)) return (i - 1) / CROSSING_STEPS;
    }
    return 1;
  }

  /** How long a corner takes from `from` to `to`: `flipDuration` for a full path, less for a short one. */
  private durationOf(from: Point, to: Point): number {
    const length = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    return (
      Math.max(SHORTEST_FLIP, Math.min(1, length / FULL_FLIP_LENGTH)) * this.options.flipDuration
    );
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
    return this.settle(session, pos, turns ? this.away(session) : this.home(session), turns);
  }

  /** Carry one leaf from `from` to `to`, and end its turn there. */
  private settle(session: Session, from: Point, to: Point, turns: boolean): Promise<boolean> {
    return this.animate(
      [{ leaf: session, from, to: () => to, delay: 0, duration: this.durationOf(from, to) }],
      turns,
      true,
    );
  }

  /**
   * Runs the tracks as one animation. Resolves with whether the turn was made; a cancelled
   * animation resolves with `false`. With `turn`, each leaf lands where its track ends; with
   * `reset`, the turn is over when the last track ends.
   */
  private animate(tracks: readonly Track[], turn: boolean, reset: boolean): Promise<boolean> {
    this.tween?.finish();
    const total = Math.max(0, ...tracks.map((track) => track.delay + track.duration));
    const landed = new Set<Track>();

    const step = (elapsed: number): void => {
      for (const track of tracks) {
        if (landed.has(track) || elapsed < track.delay) continue;
        if (!this.leaves.includes(track.leaf)) this.lift(track.leaf);
        const t = track.duration <= 0 ? 1 : Math.min(1, (elapsed - track.delay) / track.duration);
        this.bend(track.leaf, lerp(track.from, track.to(), t >= 1 ? 1 : this.options.easing(t)));
        if (t >= 1 && turn) {
          landed.add(track);
          this.land(track.leaf);
        }
      }
      this.render();
    };

    // A leaf that starts at once is shown where it starts before the first frame comes round.
    const starting = tracks.filter((track) => track.delay === 0 && track.leaf.fold === null);
    for (const track of starting) {
      if (!this.leaves.includes(track.leaf)) this.lift(track.leaf);
      this.bend(track.leaf, track.from);
    }
    if (starting.length > 0) this.render();

    return new Promise((resolve) => {
      this.settleTween = resolve;
      this.tween = startTween(this.clock, {
        duration: total,
        easing: (t) => t,
        onFrame: (t) => step(t * total),
        onEnd: () => {
          this.tween = null;
          this.settleTween = null;
          if (this.turn === null) {
            resolve(false);
            return;
          }
          if (reset) {
            this.endTurn();
            this.announce();
            this.setState(FlipState.read);
            this.render();
          }
          resolve(turn);
        },
      });
    });
  }

  private lift(leaf: Session): void {
    this.leaves.push(leaf);
    this.syncDrawingDensity();
  }

  /** The leaf is down on the spread it leads to, which now lies flat under the rest. */
  private land(leaf: Session): void {
    this.leaves = this.leaves.filter((other) => other !== leaf);
    if (this.turn !== null) this.turn.landed++;
    this.spreadIndex = leaf.target;
    this.placeSpread();
    this.syncDrawingDensity();
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
        if (this.tween === null) this.applyFold(current, this.cuePoint(current));
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
    void this.animate(
      [
        {
          leaf: session,
          from,
          to: () => this.cuePoint(session),
          delay: 0,
          duration: this.durationOf(from, this.cuePoint(session)),
        },
      ],
      false,
      false,
    );
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
    return this.inFromHome(session, REST_NUDGE.in, REST_NUDGE.down);
  }

  /** Where an animated turn picks the corner up: a tenth of the page's height in from `home`. */
  private liftPoint(session: Session): Point {
    const margin = session.pageHeight / 10;
    return this.inFromHome(session, margin, margin);
  }

  /** `home`, moved `across` toward the spine and `down` the edge from its corner. */
  private inFromHome(session: Session, across: number, down: number): Point {
    const home = this.home(session);
    return {
      x: home.x - Math.sign(home.x) * across,
      y: session.corner === FlipCorner.bottom ? home.y - down : down,
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
    this.applyFold(session, {
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
      return this.settle(session, session.fold.position, this.away(session), true);
    }
    return direction === FlipDirection.forward ? this.flipNext(corner) : this.flipPrev(corner);
  }

  private click(containerPos: Point): void {
    if (this.options.click === ClickMode.off || !this.isHandle(containerPos)) return;
    const bookPos = containerToBook(containerPos, this.rect);
    const step = this.directionAt(bookPos) === FlipDirection.forward ? 1 : -1;
    void this.flipBy(step, this.cornerAt(bookPos));
  }

  // ---- the flip session -----------------------------------------------------------------------

  /** A turn of one leaf toward the side the pointer is on, from the corner it is nearer. */
  private start(containerPos: Point): Session | null {
    this.endTurn();
    const bookPos = containerToBook(containerPos, this.rect);
    const direction = this.directionAt(bookPos);
    const target = this.spreadIndex + (direction === FlipDirection.forward ? 1 : -1);
    const to = this.spreads[target]?.[0];
    const leaf = this.leaf(direction, this.cornerAt(bookPos), this.spreadIndex, target);
    if (leaf === null || to === undefined) return null;
    this.turn = { from: this.currentPage, to, direction, leaves: 1, landed: 0 };
    this.lift(leaf);
    return leaf;
  }

  /** The leaf that turns from spread `from` to spread `to`, not yet in the air. */
  private leaf(
    direction: FlipDirection,
    corner: FlipCorner,
    from: number,
    to: number,
  ): Session | null {
    const pages = flipPages(this.spreads, this.orientation, this.pages.length, from, to);
    if (pages === null) return null;
    return {
      direction,
      corner,
      front: pages.front,
      flipping: pages.flipping,
      bottom: pages.bottom,
      target: to,
      pageWidth: this.rect.pageWidth,
      pageHeight: this.rect.height,
      reversed: this.orientation === Orientation.portrait && direction === FlipDirection.back,
      lean: 0,
      fold: null,
      progress: 0,
      hardAngle: 0,
      shadow: null,
    };
  }

  /** Stop the running animation where it is, settling its promise with "did not turn". */
  private stopTween(): void {
    this.tween?.cancel();
    this.tween = null;
    this.settleTween?.(false);
    this.settleTween = null;
  }

  /** Drop whatever is in the air. Leaves that landed stay down; whoever shows the book next tells the host. */
  private endTurn(): void {
    this.stopTween();
    this.leaves = [];
    this.turn = null;
    this.syncDrawingDensity();
  }

  /** Move a leaf's corner to a page-space point and draw it. */
  private applyFold(leaf: Session, pagePos: Point): void {
    this.bend(leaf, pagePos);
    this.render();
  }

  /** Move a leaf's corner to a page-space point. Degenerate points keep the previous fold. */
  private bend(session: Session, pagePos: Point): void {
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
    session.hardAngle =
      (foldDirection(session) === FlipDirection.forward ? 90 : -90) * ((200 - swing * 2) / 100);
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
    const inAir = this.leaves.flatMap((leaf) =>
      leaf.fold === null ? [] : [{ leaf, fold: leaf.fold }],
    );
    // The leaf that lifted first is on top: it covers the ones after it until it is down. A
    // reversed riffle is a forward one run backward, so there the last to lift is on top.
    const onTop = inAir[0]?.leaf.reversed ? inAir.toReversed() : inAir;
    const lowest = onTop.at(-1)?.leaf;
    const liftsFrom =
      lowest === undefined
        ? null
        : foldDirection(lowest) === FlipDirection.forward
          ? "right"
          : "left";
    return {
      rect: this.rect,
      container: this.container,
      orientation: this.orientation,
      left: liftsFrom === "left" ? (lowest?.bottom ?? null) : this.left,
      right: liftsFrom === "right" ? (lowest?.bottom ?? null) : this.right,
      leaves: onTop.map(({ leaf, fold }) => ({
        direction: foldDirection(leaf),
        corner: leaf.corner,
        front: leaf.front,
        flipping: leaf.flipping,
        bottom: leaf.bottom,
        fold,
        progress: leaf.progress,
        hardAngle: leaf.hardAngle,
        shadow: leaf.shadow,
      })),
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
    const turn = this.turn;
    const inAir = this.leaves.filter((leaf) => leaf.fold !== null);
    const now: FlipProgress | null =
      turn !== null && (inAir.length > 0 || turn.landed > 0)
        ? {
            from: turn.from,
            to: turn.to,
            direction: turn.direction,
            progress:
              inAir.reduce(
                (sum, leaf) =>
                  sum + (leaf.reversed ? 1 - leaf.progress / 100 : leaf.progress / 100),
                turn.landed,
              ) / turn.leaves,
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
    this.endTurn();
    // Nothing is drawn again, so a turn that was under way is closed here.
    this.reportProgress();
  }
}
