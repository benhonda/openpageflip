/**
 * Draws a `Frame` with plain DOM: absolutely positioned page elements, `clip-path` polygons for
 * soft pages, `rotateY` for hard ones, and four gradient elements for shadows. The style strings
 * are the original's, so a frame lands on the same pixels; writes happen only when a frame is
 * handed over, never on a timer. A frame is in book space; the `Axes` for the binding turn it to
 * the screen: a mirror for a right-bound book, a transpose for a top-bound one, with sizes swapped
 * and every rotation reversed to match.
 */

import { type Axes, axesFor, isVertical, type ScreenSide } from "../axes.ts";
import type { FlipFrame, Frame, ShadowData } from "../controller.ts";
import { pageToContainer } from "../coords.ts";
import type { Point } from "../geometry/point.ts";
import { clipPolygonToMinX, rotatePoint } from "../geometry/point.ts";
import type { BookRect } from "../layout.ts";
import {
  type Binding,
  FlipDirection,
  Layout,
  Orientation,
  PageDensity,
  type ResolvedOptions,
  SizeMode,
} from "../options.ts";
import type { PageModel } from "../pages.ts";

/**
 * Stacking, in tens so the blank sheets of a clump can sit between two layers, one step lower
 * each: a hard clump's boards just under the board turning, a soft clump's flaps just under the
 * page revealed, which hides where a curled sheet's fold swings past the turning page's own.
 */
const Z = {
  flat: 10,
  bottom: 30,
  hardShadow: 40,
  flipping: 50,
  hardInnerShadow: 50,
  shadow: 100,
} as const;

const CLASS = {
  book: "opf-book",
  page: "opf-page",
  /** The side of the screen a page sits on: `opf-page--left`, `--right`, `--top` or `--bottom`. */
  side: (side: ScreenSide) => `opf-page--${side}`,
  /** The binding, on the container: `opf-book--left`, `--right`, `--top` or `--bottom`. */
  bound: (binding: Binding) => `opf-book--${binding}`,
  flat: "opf-page--flat",
  /** The page in the air: furled, dragged or flipping. The stylesheet draws its edge. */
  turning: "opf-page--turning",
  soft: "opf-page--soft",
  hard: "opf-page--hard",
  shadow: "opf-shadow",
  /** Blank paper standing for the sheets of a clump a jump turns at once. */
  sheet: "opf-sheet",
} as const;

type Side = "left" | "right";
/** A page off the flat: the one `turning`, or the one `bottom` it uncovers. Names its `Z` entry. */
type Layer = "flipping" | "bottom";

/**
 * The inline properties this renderer owns on a page element. Every draw sets all of them
 * (clearing the ones it does not use) and touches nothing else, so a page keeps whatever other
 * inline style its author or framework gave it.
 */
const PAGE_STYLE = [
  "display",
  "position",
  "zIndex",
  "left",
  "top",
  "width",
  "height",
  "transformOrigin",
  "transform",
  "clipPath",
  "backfaceVisibility",
] as const;
type PageStyle = Partial<Record<(typeof PAGE_STYLE)[number], string>>;

function applyPageStyle(el: HTMLElement, style: PageStyle): void {
  for (const key of PAGE_STYLE) el.style[key] = style[key] ?? "";
}

type SizingOptions = Pick<
  ResolvedOptions,
  "autoSize" | "size" | "width" | "height" | "minWidth" | "maxWidth" | "layout" | "binding"
>;

/** Element-local points as a `clip-path`. No points (a page wholly off stage) clips everything. */
function clipPath(points: readonly Point[]): string {
  return points.length === 0
    ? "inset(100%)"
    : `polygon(${points.map((p) => `${p.x}px ${p.y}px`).join(", ")})`;
}

type Saved = { readonly cssText: string; readonly className: string };

export class DomRenderer {
  private readonly shadows: Record<"outer" | "inner" | "hardOuter" | "hardInner", HTMLDivElement>;
  /** Blank paper for the sheets of a clump, made as a jump first needs them and kept hidden after. */
  private readonly blanks: HTMLDivElement[] = [];
  private pages: readonly PageModel[] = [];
  private saved = new Map<HTMLElement, Saved>();
  /**
   * In portrait a page lifts away from itself: the flat page stays and a mirrored copy folds
   * over it. The copy is inert, has no ids, and lives only for the duration of the flip.
   */
  private clone: { readonly source: HTMLElement; readonly element: HTMLElement } | null = null;
  /** Pages currently hidden inline. A page is hidden once when it leaves the stage, not every frame. */
  private hidden = new Set<number>();

  private readonly container: HTMLElement;
  private readonly options: SizingOptions;
  /** Rebuilt on every frame from the container size the frame carries. */
  private axes: Axes;

  constructor(container: HTMLElement, options: SizingOptions) {
    this.container = container;
    this.options = options;
    this.axes = axesFor(options.binding, { width: 0, height: 0 });
    container.classList.add(CLASS.book, CLASS.bound(options.binding));
    const shadow = (name: string): HTMLDivElement => {
      const el = document.createElement("div");
      el.className = `${CLASS.shadow} ${CLASS.shadow}--${name}`;
      el.style.display = "none";
      container.append(el);
      return el;
    };
    this.shadows = {
      outer: shadow("outer"),
      inner: shadow("inner"),
      hardOuter: shadow("hard-outer"),
      hardInner: shadow("hard-inner"),
    };
    this.applyContainerSizing();
  }

  setPages(pages: readonly PageModel[]): void {
    for (const page of this.pages) {
      if (!pages.some((next) => next.element === page.element)) this.restore(page.element);
    }
    this.pages = pages;
    this.hidden.clear();
    for (const page of pages) {
      if (this.saved.has(page.element)) continue;
      this.saved.set(page.element, {
        cssText: page.element.style.cssText,
        className: page.element.className,
      });
      page.element.classList.add(CLASS.page);
      if (page.element.parentElement !== this.container) this.container.append(page.element);
    }
  }

  /** Aspect ratio and width limits on the container, when the book sizes itself. */
  applyContainerSizing(orientation: Orientation = Orientation.landscape): void {
    const { autoSize, size, width, height, minWidth, maxWidth, layout, binding } = this.options;
    if (!autoSize) return;
    const narrowest = size === SizeMode.fixed ? width : minWidth;
    const widest = size === SizeMode.fixed ? width : maxWidth;
    const shown = orientation === Orientation.portrait ? 1 : 2;
    const style = this.container.style;
    style.width = "100%";
    if (isVertical(binding)) {
      // Pages stack along the height, so the container is always one page wide.
      style.minWidth = `${narrowest}px`;
      style.maxWidth = `${widest}px`;
      style.aspectRatio = `${width} / ${height * shown}`;
    } else {
      // Narrowest: one page unless spreads are forced. Widest: two pages unless single is forced.
      const minAcross = layout === Layout.spread ? 2 : 1;
      const maxAcross = layout === Layout.single ? 1 : 2;
      style.minWidth = `${narrowest * minAcross}px`;
      style.maxWidth = `${widest * maxAcross}px`;
      style.aspectRatio = `${width * shown} / ${height}`;
    }
  }

  render(frame: Frame): void {
    const { rect, flip } = frame;
    this.axes = axesFor(this.options.binding, frame.container);
    const active = new Set<number>();
    for (const index of [frame.left, frame.right, flip?.flipping, flip?.bottom]) {
      if (index !== undefined && index !== null) active.add(index);
    }
    // Inline, because a page's own stylesheet (display: flex, say) would beat the class rule.
    for (const [index, page] of this.pages.entries()) {
      if (active.has(index)) {
        this.hidden.delete(index);
      } else if (!this.hidden.has(index)) {
        applyPageStyle(page.element, { display: "none" });
        page.element.classList.remove(CLASS.turning);
        this.hidden.add(index);
      }
    }

    const flippingHard =
      flip !== null && this.pages[flip.flipping]?.drawingDensity === PageDensity.hard;

    if (frame.orientation !== Orientation.portrait && frame.left !== null) {
      if (flip !== null && flip.direction === FlipDirection.back && flippingHard) {
        this.drawHard(frame.left, "left", 180 + flip.hardAngle, "flipping", rect);
      } else {
        this.drawFlat(frame.left, "left", rect);
      }
    }
    if (frame.right !== null) {
      if (flip !== null && flip.direction === FlipDirection.forward && flippingHard) {
        this.drawHard(frame.right, "right", 180 + flip.hardAngle, "flipping", rect);
      } else {
        this.drawFlat(frame.right, "right", rect);
      }
    }

    this.drawSheets(flip, flippingHard, frame);

    if (flip === null) {
      this.dropClone();
      this.hideShadows();
      return;
    }
    // In portrait a page turning forward is the page on show. A soft one folds over itself as a
    // copy; a hard one has already been drawn lifting, above, and has no second face to draw.
    const isPageOnShow = flip.flipping === frame.right;
    const liftsFromItself = !flippingHard && isPageOnShow;
    if (!liftsFromItself) this.dropClone();

    if (flip.bottom !== null) {
      const bottomSide: Side = flip.direction === FlipDirection.back ? "left" : "right";
      if (flippingHard) {
        this.drawHard(flip.bottom, bottomSide, 0, "bottom", rect);
      } else {
        this.drawSoft(
          flip.bottom,
          bottomSide,
          flip.fold.bottomClip,
          flip.fold.bottomPagePosition,
          0,
          flip.direction,
          "bottom",
          rect,
        );
      }
    }

    // In portrait every turn runs forward (a back turn is reversed, see `Session` in
    // `controller.ts`), and only the page on show, x >= 0 in its page space, is on stage: what
    // folds past the spine would float beside the book.
    const onStage = (points: readonly Point[]): readonly Point[] =>
      frame.orientation === Orientation.portrait ? clipPolygonToMinX(points, 0) : points;

    const flippingSide: Side =
      flip.direction === FlipDirection.forward && frame.orientation !== Orientation.portrait
        ? "left"
        : "right";
    if (flippingHard) {
      if (!isPageOnShow) {
        this.drawHard(flip.flipping, flippingSide, flip.hardAngle, "flipping", rect);
      }
    } else {
      this.drawSoft(
        flip.flipping,
        flippingSide,
        onStage(flip.fold.flippingClip),
        flip.fold.activeCorner,
        flip.fold.angle,
        flip.direction,
        "flipping",
        rect,
        liftsFromItself,
      );
    }

    if (flip.shadow === null) {
      this.hideShadows();
    } else if (flippingHard && frame.orientation === Orientation.portrait) {
      this.hideSoftShadows();
      this.drawHardCastShadow(flip.shadow, rect);
    } else if (flippingHard) {
      this.hideSoftShadows();
      // A hard page's shadow needs a page to fall on, and either side can be bare: a cover opens
      // onto the empty side of the stage and closes away from it, and so does the lone last page.
      // The original painted the shadow on the bare background.
      const landing = flip.direction === FlipDirection.forward ? frame.left : frame.right;
      this.drawHardShadows(flip.shadow, rect, {
        landing: landing !== null,
        lifting: flip.bottom !== null,
      });
    } else {
      this.hideHardShadows();
      const { topLeft, topRight, bottomRight, bottomLeft } = flip.fold.rect;
      this.drawSoftShadows(
        flip.shadow,
        onStage([topLeft, topRight, bottomRight, bottomLeft]),
        rect,
      );
    }
  }

  // ---- pages ----------------------------------------------------------------------------------

  private element(index: number, side: Side, asClone = false): HTMLElement | null {
    const page = this.pages[index];
    if (page === undefined) return null;
    const el = asClone ? this.cloneOf(page.element) : page.element;
    // Re-asserted on every draw: a framework may have rewritten the class attribute since.
    el.classList.add(CLASS.page);
    // What the page is, not how this turn draws it: a soft page beside a hard one swings as a
    // board for the turn, and a class that followed it there would blink the page's own styling.
    el.classList.toggle(CLASS.hard, page.density === PageDensity.hard);
    el.classList.toggle(CLASS.soft, page.density === PageDensity.soft);
    // The side a page sits on as the reader sees it: a right-bound book's "left" page is on the
    // right, a top-bound book's on top.
    el.classList.toggle(CLASS.side(this.axes.side("left")), side === "left");
    el.classList.toggle(CLASS.side(this.axes.side("right")), side === "right");
    return el;
  }

  private cloneOf(source: HTMLElement): HTMLElement {
    if (this.clone?.source === source) return this.clone.element;
    this.dropClone();
    const element = source.cloneNode(true);
    if (!(element instanceof HTMLElement))
      throw new TypeError("@openpageflip/core: a page clone is not an element");
    element.removeAttribute("id");
    for (const el of element.querySelectorAll("[id]")) el.removeAttribute("id");
    element.setAttribute("aria-hidden", "true");
    element.inert = true;
    element.dataset["opfClone"] = "";
    source.after(element);
    this.clone = { source, element };
    return element;
  }

  private dropClone(): void {
    this.clone?.element.remove();
    this.clone = null;
  }

  /** A page's box on screen. */
  private pageSize(rect: BookRect): { width: string; height: string } {
    const size = this.axes.size({ width: rect.pageWidth, height: rect.height });
    return { width: `${size.width}px`, height: `${size.height}px` };
  }

  /**
   * Where an element goes on screen, given its book-space `translate` and transform `origin`
   * (`translate3d` then `rotate`, as the style strings do) and its book-space `width`. The origin
   * maps as an element-local point; the translate is where the origin lands in the container,
   * minus where the origin sits in the element on screen.
   */
  private placement(
    translate: Point,
    origin: Point,
    width: number,
  ): { readonly translate: Point; readonly origin: Point } {
    const localOrigin = this.axes.local(origin, width);
    const at = this.axes.toScreen({ x: translate.x + origin.x, y: translate.y + origin.y });
    return {
      origin: localOrigin,
      translate: { x: at.x - localOrigin.x, y: at.y - localOrigin.y },
    };
  }

  /** Rotation about the spine, as CSS: about the y axis on screen, or the x axis when stacked. */
  private spin(degrees: number): string {
    const turned = this.axes.angle(degrees);
    return this.axes.vertical ? `rotateX(${turned}deg)` : `rotateY(${turned}deg)`;
  }

  /** A gradient running along book-space x, as the screen keyword for `linear-gradient`. */
  private toward(bookSide: "left" | "right"): string {
    return `to ${this.axes.side(bookSide)}`;
  }

  private drawFlat(index: number, side: Side, rect: BookRect): void {
    const el = this.element(index, side);
    if (el === null) return;
    el.classList.add(CLASS.flat);
    el.classList.remove(CLASS.turning);
    const at = this.placement(
      { x: side === "right" ? rect.left + rect.pageWidth : rect.left, y: rect.top },
      { x: 0, y: 0 },
      rect.pageWidth,
    ).translate;
    applyPageStyle(el, {
      position: "absolute",
      display: "block",
      ...this.pageSize(rect),
      left: `${at.x}px`,
      top: `${at.y}px`,
      zIndex: String(Z.flat),
    });
  }

  private drawSoft(
    index: number,
    side: Side,
    area: readonly Point[],
    position: Point,
    angle: number,
    direction: FlipDirection,
    layer: Layer,
    rect: BookRect,
    asClone = false,
  ): void {
    const el = this.element(index, side, asClone);
    if (el === null) return;
    el.classList.remove(CLASS.flat);
    el.classList.toggle(CLASS.turning, layer === "flipping");
    const at = this.placement(
      pageToContainer(position, rect, direction),
      { x: 0, y: 0 },
      rect.pageWidth,
    );
    const polygon = clipPath(
      area.map((p) => {
        const local =
          direction === FlipDirection.back
            ? { x: -p.x + position.x, y: p.y - position.y }
            : { x: p.x - position.x, y: p.y - position.y };
        return this.axes.local(rotatePoint(local, { x: 0, y: 0 }, angle), rect.pageWidth);
      }),
    );
    applyPageStyle(el, {
      position: "absolute",
      display: "block",
      zIndex: String(Z[layer]),
      left: "0",
      top: "0",
      ...this.pageSize(rect),
      transformOrigin: `${at.origin.x}px ${at.origin.y}px`,
      clipPath: polygon,
      transform: `translate3d(${at.translate.x}px, ${at.translate.y}px, 0) rotate(${this.axes.angle(angle)}rad)`,
    });
  }

  /** Where a page on `side` goes to turn about its spine edge: the left page's right edge, the right page's left. */
  private hingedAt(
    side: Side,
    rect: BookRect,
  ): { readonly translate: Point; readonly origin: Point } {
    const spine = rect.left + rect.width / 2;
    return this.placement(
      { x: side === "left" ? rect.left : spine, y: rect.top },
      side === "left" ? { x: rect.pageWidth, y: 0 } : { x: 0, y: 0 },
      rect.pageWidth,
    );
  }

  private drawHard(index: number, side: Side, angle: number, layer: Layer, rect: BookRect): void {
    const el = this.element(index, side);
    if (el === null) return;
    el.classList.remove(CLASS.flat);
    el.classList.toggle(CLASS.turning, layer === "flipping");
    const at = this.hingedAt(side, rect);
    applyPageStyle(el, {
      position: "absolute",
      display: "block",
      zIndex: String(Z[layer]),
      left: "0",
      top: "0",
      ...this.pageSize(rect),
      backfaceVisibility: "hidden",
      clipPath: "none",
      transformOrigin: `${at.origin.x}px ${at.origin.y}px`,
      transform: `translate3d(${at.translate.x}px, ${at.translate.y}px, 0) ${this.spin(angle)}`,
    });
  }

  // ---- a clump of sheets ----

  /**
   * The `i`th piece of blank paper: a wrapper that draws the paper's edge, around the paper
   * itself, cut to shape. The edge is a drop shadow, which the cut would trim off the paper.
   */
  private blank(i: number): { readonly edge: HTMLDivElement; readonly paper: HTMLDivElement } {
    const existing = this.blanks[i];
    const edge = existing ?? document.createElement("div");
    if (existing === undefined) {
      edge.className = CLASS.sheet;
      edge.append(document.createElement("div"));
      this.container.append(edge);
      this.blanks.push(edge);
    }
    const paper = edge.firstElementChild;
    if (!(paper instanceof HTMLDivElement)) {
      throw new TypeError("@openpageflip/core: a sheet has lost its paper");
    }
    return { edge, paper };
  }

  /**
   * The blank sheets turning with a page when a jump turns several at once: plain paper in the
   * colour of the inner pages, each edged with a hairline so the stack reads as sheets. Soft:
   * each sheet's flap, under the page revealed, peeking out along the turning page's curled
   * edges. Hard: a sheet swinging a little behind the board turning, showing past its edge.
   */
  private drawSheets(flip: FlipFrame | null, hard: boolean, frame: Frame): void {
    const sheets = flip?.sheets ?? [];
    const colour = flip === null || sheets.length === 0 ? "" : this.innerPaper(flip, frame);
    const portrait = frame.orientation === Orientation.portrait;
    const cover = `width: ${frame.container.width}px; height: ${frame.container.height}px;`;
    for (const [i, sheet] of sheets.entries()) {
      if (flip === null) break;
      const { edge, paper } = this.blank(i);
      edge.style.cssText = `display: block; ${cover} z-index: ${(hard ? Z.flipping : Z.bottom) - 1 - i}; filter: drop-shadow(0 0 0.75px rgba(0, 0, 0, 0.55));${hard ? " perspective: inherit;" : ""}`;
      const fill = `position: absolute; left: 0; top: 0; background-color: var(--opf-sheet-color, ${colour}); filter: brightness(${1 - 0.015 * (i + 1)});`;
      if (hard) {
        const side: Side = flip.direction === FlipDirection.forward ? "right" : "left";
        const at = this.hingedAt(side, frame.rect);
        const size = this.pageSize(frame.rect);
        paper.style.cssText = `${fill} width: ${size.width}; height: ${size.height}; transform-origin: ${at.origin.x}px ${at.origin.y}px; transform: translate3d(${at.translate.x}px, ${at.translate.y}px, 0) ${this.spin(180 + sheet.hardAngle)};`;
        continue;
      }
      // Only the page on show is on stage in portrait, as for the page turning.
      const flap = portrait ? clipPolygonToMinX(sheet.flap, 0) : sheet.flap;
      const points = flap.map((p) =>
        this.axes.toScreen(pageToContainer(p, frame.rect, flip.direction)),
      );
      paper.style.cssText = `${fill} ${cover} clip-path: ${clipPath(points)};`;
    }
    for (const el of this.blanks.slice(sheets.length)) el.style.cssText = "display: none";
  }

  /**
   * The paper colour of the sheets between: a soft page's background, from the page revealed,
   * the one lifting or the one coming over, so a cover's colour never stands in for the pages
   * inside it. White when none is soft or has a background of its own.
   */
  private innerPaper(flip: FlipFrame, frame: Frame): string {
    const front = flip.direction === FlipDirection.forward ? frame.right : frame.left;
    const candidates = [flip.bottom, front, flip.flipping].flatMap((index) => {
      const page = index === null ? undefined : this.pages[index];
      return page === undefined ? [] : [page];
    });
    const page = candidates.find((p) => p.density === PageDensity.soft);
    const colour = page === undefined ? "" : getComputedStyle(page.element).backgroundColor;
    return colour === "" || colour === "transparent" || colour === "rgba(0, 0, 0, 0)"
      ? "#fff"
      : colour;
  }

  // ---- shadows --------------------------------------------------------------------------------

  /** `flipping` is the part of the turning page the inner shadow may fall on. */
  private drawSoftShadows(shadow: ShadowData, flipping: readonly Point[], rect: BookRect): void {
    const forward = shadow.direction === FlipDirection.forward;
    const at = pageToContainer(shadow.pos, rect, shadow.direction);
    const angle = shadow.angle + (3 * Math.PI) / 2;
    // A gradient strip `width` wide and two pages tall in book space, turned about a point 100px
    // down its `translate` edge, placed so that point sits at `at`, and clipped to `points`.
    const place = (
      width: number,
      translate: number,
      points: readonly Point[],
      gradient: string,
    ): string => {
      const size = this.axes.size({ width, height: rect.height * 2 });
      const origin = { x: translate, y: 100 };
      const clip = clipPath(
        points.map((p) => {
          const offset = forward
            ? { x: p.x - shadow.pos.x, y: p.y - shadow.pos.y }
            : { x: -p.x + shadow.pos.x, y: p.y - shadow.pos.y };
          return this.axes.local(rotatePoint(offset, origin, angle), width);
        }),
      );
      const to = this.placement({ x: at.x - origin.x, y: at.y - origin.y }, origin, width);
      return `display: block; z-index: ${Z.shadow}; width: ${size.width}px; height: ${size.height}px; background: linear-gradient(${gradient}); transform-origin: ${to.origin.x}px ${to.origin.y}px; transform: translate3d(${to.translate.x}px, ${to.translate.y}px, 0) rotate(${this.axes.angle(angle)}rad); clip-path: ${clip};`;
    };

    this.shadows.outer.style.cssText = place(
      shadow.width,
      forward ? 0 : shadow.width,
      [
        { x: 0, y: 0 },
        { x: rect.pageWidth, y: 0 },
        { x: rect.pageWidth, y: rect.height },
        { x: 0, y: rect.height },
      ],
      `${this.toward(forward ? "right" : "left")}, rgba(0, 0, 0, ${shadow.opacity}), rgba(0, 0, 0, 0)`,
    );

    const innerWidth = (shadow.width * 3) / 4;
    this.shadows.inner.style.cssText = place(
      innerWidth,
      forward ? innerWidth : 0,
      flipping,
      `${this.toward(forward ? "left" : "right")}, rgba(0, 0, 0, ${shadow.opacity}) 5%, rgba(0, 0, 0, 0.05) 15%, rgba(0, 0, 0, ${shadow.opacity}) 35%, rgba(0, 0, 0, 0) 100%`,
    );
  }

  /**
   * Two gradients at the spine. Until the page passes the spine, the inner one lies on the
   * landing side and darkens as the page comes down, and the outer one lies under the lifting
   * page; past the spine they trade places. `hasPage` says which sides have a page to receive a
   * shadow; the gradient that would sit on a bare side stays hidden.
   */
  private drawHardShadows(
    shadow: ShadowData,
    rect: BookRect,
    hasPage: { readonly landing: boolean; readonly lifting: boolean },
  ): void {
    const progress = shadow.progress > 100 ? 200 - shadow.progress : shadow.progress;
    const size = Math.min(rect.pageWidth, ((100 - progress) * (2.5 * rect.pageWidth)) / 100 + 20);
    const spine = rect.left + rect.width / 2;
    const flipped =
      (shadow.direction === FlipDirection.forward && shadow.progress > 100) ||
      (shadow.direction === FlipDirection.back && shadow.progress <= 100);
    const pastSpine = shadow.progress > 100;
    const showInner = pastSpine ? hasPage.lifting : hasPage.landing;
    const showOuter = pastSpine ? hasPage.landing : hasPage.lifting;
    const box = this.axes.size({ width: size, height: rect.height });
    const at = this.placement({ x: spine, y: rect.top }, { x: 0, y: 0 }, size);
    const common = `display: block; width: ${box.width}px; height: ${box.height}px; left: ${at.translate.x}px; top: ${at.translate.y}px; transform-origin: ${at.origin.x}px ${at.origin.y}px;`;
    this.shadows.hardInner.style.cssText = showInner
      ? `${common} z-index: ${Z.hardInnerShadow}; background: linear-gradient(${this.toward("right")}, rgba(0, 0, 0, ${(shadow.opacity * progress) / 100}) 5%, rgba(0, 0, 0, 0) 100%); transform: translate3d(0, 0, 0)${flipped ? "" : ` ${this.spin(180)}`};`
      : "display: none";
    this.shadows.hardOuter.style.cssText = showOuter
      ? `${common} z-index: ${Z.hardShadow}; background: linear-gradient(${this.toward("left")}, rgba(0, 0, 0, ${shadow.opacity}) 5%, rgba(0, 0, 0, 0) 100%); transform: translate3d(0, 0, 0)${flipped ? ` ${this.spin(180)}` : ""};`
      : "display: none";
  }

  /**
   * In portrait a hard page lifts over the page it uncovers with no page on the other side to take
   * the landscape pair's second gradient, and the first, darkest at its far end and cut off
   * square, would sweep across that page on its own. Instead the board casts one shadow from the
   * spine, darkest at its foot and fading outward, reaching further past the board's edge the
   * higher it stands. The board covers what lies under it, so what shows trails off its edge and
   * fades as it lies flat.
   */
  private drawHardCastShadow(shadow: ShadowData, rect: BookRect): void {
    this.shadows.hardInner.style.cssText = "display: none";
    // Portrait swings a quarter turn: `progress` 0..100 is flat to upright.
    const lift = (Math.min(100, shadow.progress) / 100) * (Math.PI / 2);
    const reach = rect.pageWidth * Math.cos(lift) + (rect.pageWidth / 3) * Math.sin(lift);
    const spine = rect.left + rect.width / 2;
    const box = this.axes.size({ width: reach, height: rect.height });
    const at = this.placement({ x: spine, y: rect.top }, { x: 0, y: 0 }, reach).translate;
    this.shadows.hardOuter.style.cssText = `display: block; z-index: ${Z.hardShadow}; width: ${box.width}px; height: ${box.height}px; left: ${at.x}px; top: ${at.y}px; background: linear-gradient(${this.toward("right")}, rgba(0, 0, 0, ${shadow.opacity}), rgba(0, 0, 0, 0));`;
  }

  private hideSoftShadows(): void {
    this.shadows.outer.style.cssText = "display: none";
    this.shadows.inner.style.cssText = "display: none";
  }
  private hideHardShadows(): void {
    this.shadows.hardOuter.style.cssText = "display: none";
    this.shadows.hardInner.style.cssText = "display: none";
  }
  private hideShadows(): void {
    this.hideSoftShadows();
    this.hideHardShadows();
  }

  // ---- teardown -------------------------------------------------------------------------------

  private restore(element: HTMLElement): void {
    const saved = this.saved.get(element);
    if (saved === undefined) return;
    element.style.cssText = saved.cssText;
    element.className = saved.className;
    this.saved.delete(element);
  }

  /** Put the container and every page back the way they were found. */
  destroy(): void {
    this.dropClone();
    this.hidden.clear();
    for (const page of this.pages) this.restore(page.element);
    this.pages = [];
    for (const el of Object.values(this.shadows)) el.remove();
    for (const el of this.blanks) el.remove();
    this.blanks.length = 0;
    this.container.classList.remove(CLASS.book, CLASS.bound(this.options.binding));
    const style = this.container.style;
    style.width = "";
    style.minWidth = "";
    style.maxWidth = "";
    style.aspectRatio = "";
  }
}
