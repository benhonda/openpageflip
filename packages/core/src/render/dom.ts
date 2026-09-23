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
import { clipPolygonToHalfPlane, rotatePoint } from "../geometry/point.ts";
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
 * Stacking. The pages lying flat are at the bottom, with the one a hard leaf lifts off `under` it
 * raised above the other. Each leaf in the air gets a band of `LAYER` above them, the one on top
 * highest.
 */
const Z = { flat: 1, under: 2 } as const;
/** A leaf's layers, in the order it draws them within its band. */
const LAYER = {
  /** A soft leaf's front, where it still lies flat. */
  front: 0,
  hardShadow: 1,
  /** The faces in the air: a soft leaf's flap, a hard leaf's board. */
  turning: 2,
  hardInnerShadow: 2,
  shadow: 3,
} as const;
const BAND = 4;
type Layer = keyof typeof LAYER;

/** The z-index of a layer in the band of the leaf `below` others from the top of `count`. */
function zIndex(layer: Layer, below: number, count: number): string {
  return String(Z.under + 1 + (count - 1 - below) * BAND + LAYER[layer]);
}

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
} as const;

type Side = "left" | "right";
/** What a page is doing, as its classes say: lying flat (all or in part), or in the air. */
type Pose = "flat" | "turning";
type Shadows = Record<"outer" | "inner" | "hardOuter" | "hardInner", HTMLDivElement>;

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
  /** One set of shadows per leaf in the air, made as they are first needed and kept. */
  private readonly shadows: Shadows[] = [];
  private pages: readonly PageModel[] = [];
  private saved = new Map<HTMLElement, Saved>();
  /**
   * In portrait a page lifts away from itself: its flat part stays and a mirrored copy folds over
   * it. A copy is inert, has no ids, and lives only while its leaf is in the air.
   */
  private clones = new Map<HTMLElement, HTMLElement>();
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
    // The first set goes in now, ahead of any page appended later, as it always has.
    this.shadowsFor(0);
    this.applyContainerSizing();
  }

  /** The shadows of the leaf `index` from the top. */
  private shadowsFor(index: number): Shadows {
    const existing = this.shadows[index];
    if (existing !== undefined) return existing;
    const shadow = (name: string): HTMLDivElement => {
      const el = document.createElement("div");
      el.className = `${CLASS.shadow} ${CLASS.shadow}--${name}`;
      el.style.display = "none";
      this.container.append(el);
      return el;
    };
    const made: Shadows = {
      outer: shadow("outer"),
      inner: shadow("inner"),
      hardOuter: shadow("hard-outer"),
      hardInner: shadow("hard-inner"),
    };
    this.shadows.push(made);
    return made;
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
    const { rect, leaves } = frame;
    this.axes = axesFor(this.options.binding, frame.container);
    const active = new Set<number>();
    for (const index of [frame.left, frame.right]) if (index !== null) active.add(index);
    for (const leaf of leaves) active.add(leaf.front).add(leaf.flipping);
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

    // Under a hard leaf, the page it lifts off lies over the page beside it, where two bordered
    // pages overlap at the spine, as the original drew it; under a soft one the right page does.
    const lowest = leaves.at(-1);
    const raised: Side | null =
      lowest === undefined || this.pages[lowest.flipping]?.drawingDensity !== PageDensity.hard
        ? null
        : lowest.direction === FlipDirection.forward
          ? "right"
          : "left";
    if (frame.orientation !== Orientation.portrait && frame.left !== null) {
      this.drawFlat(frame.left, "left", rect, raised === "left" ? Z.under : Z.flat);
    }
    if (frame.right !== null) {
      this.drawFlat(frame.right, "right", rect, raised === "right" ? Z.under : Z.flat);
    }

    const cloned = new Set<HTMLElement>();
    for (const [below, leaf] of leaves.entries()) {
      const source = this.drawLeaf(leaf, below, frame);
      if (source !== null) cloned.add(source);
    }
    for (const [source, clone] of this.clones) {
      if (cloned.has(source)) continue;
      clone.remove();
      this.clones.delete(source);
    }
    for (const shadows of this.shadows.slice(leaves.length)) {
      this.hideSoftShadows(shadows);
      this.hideHardShadows(shadows);
    }
  }

  /**
   * One leaf in the air, in the band `below` others from the top. A soft leaf is its front where
   * it still lies flat and its flap folded over; a hard one is a board swinging about the spine,
   * the front face up until it passes upright and the back face after. Returns the page it
   * copied, if it lifts away from itself.
   */
  private drawLeaf(leaf: FlipFrame, below: number, frame: Frame): HTMLElement | null {
    const { rect, orientation } = frame;
    const count = frame.leaves.length;
    const shadows = this.shadowsFor(below);
    const hard = this.pages[leaf.flipping]?.drawingDensity === PageDensity.hard;
    const portrait = orientation === Orientation.portrait;
    // In portrait every turn runs forward (a back turn is reversed, see `Session` in
    // `controller.ts`), and only the page on show, x >= 0 in its page space, is on stage: what
    // folds past the spine would float beside the book.
    const onStage = (points: readonly Point[]): readonly Point[] =>
      portrait ? clipPolygonToHalfPlane(points, { x: 1, y: 0 }, 0) : points;
    const frontSide: Side = leaf.direction === FlipDirection.forward ? "right" : "left";
    const flippingSide: Side =
      leaf.direction === FlipDirection.forward && !portrait ? "left" : "right";
    // In portrait the page lifts away from itself: a hard one has only the one face to swing, and
    // a soft one folds over as a copy.
    const liftsFromItself = leaf.front === leaf.flipping;
    const band = (layer: Layer): string => zIndex(layer, below, count);

    if (hard) {
      this.drawHard(leaf.front, frontSide, 180 + leaf.hardAngle, band("turning"), rect);
      if (!liftsFromItself) {
        this.drawHard(leaf.flipping, flippingSide, leaf.hardAngle, band("turning"), rect);
      }
    } else {
      this.drawSoft(
        leaf.front,
        frontSide,
        leaf.fold.flatClip,
        leaf.fold.bottomPagePosition,
        0,
        leaf.direction,
        { pose: "flat", zIndex: band("front") },
        rect,
      );
      this.drawSoft(
        leaf.flipping,
        flippingSide,
        onStage(leaf.fold.flippingClip),
        leaf.fold.activeCorner,
        leaf.fold.angle,
        leaf.direction,
        { pose: "turning", zIndex: band("turning") },
        rect,
        liftsFromItself,
      );
    }

    if (leaf.shadow === null) {
      this.hideSoftShadows(shadows);
      this.hideHardShadows(shadows);
    } else if (hard && portrait) {
      this.hideSoftShadows(shadows);
      this.drawHardCastShadow(shadows, leaf.shadow, rect, band("hardShadow"));
    } else if (hard) {
      this.hideSoftShadows(shadows);
      // A hard page's shadow needs a page to fall on, and either side can be bare: a cover opens
      // onto the empty side of the stage and closes away from it, and so does the lone last page.
      // The original painted the shadow on the bare background.
      const landing = leaf.direction === FlipDirection.forward ? frame.left : frame.right;
      this.drawHardShadows(shadows, leaf.shadow, rect, band, {
        landing: landing !== null,
        lifting: leaf.bottom !== null,
      });
    } else {
      this.hideHardShadows(shadows);
      const { topLeft, topRight, bottomRight, bottomLeft } = leaf.fold.rect;
      this.drawSoftShadows(
        shadows,
        leaf.shadow,
        onStage([topLeft, topRight, bottomRight, bottomLeft]),
        rect,
        band("shadow"),
      );
    }
    return liftsFromItself && !hard ? (this.pages[leaf.flipping]?.element ?? null) : null;
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
    const existing = this.clones.get(source);
    if (existing !== undefined) return existing;
    const element = source.cloneNode(true);
    if (!(element instanceof HTMLElement))
      throw new TypeError("@openpageflip/core: a page clone is not an element");
    element.removeAttribute("id");
    for (const el of element.querySelectorAll("[id]")) el.removeAttribute("id");
    element.setAttribute("aria-hidden", "true");
    element.inert = true;
    element.dataset["opfClone"] = "";
    source.after(element);
    this.clones.set(source, element);
    return element;
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

  private drawFlat(index: number, side: Side, rect: BookRect, zIndex: number): void {
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
      zIndex: String(zIndex),
    });
  }

  private drawSoft(
    index: number,
    side: Side,
    area: readonly Point[],
    position: Point,
    angle: number,
    direction: FlipDirection,
    place: { readonly pose: Pose; readonly zIndex: string },
    rect: BookRect,
    asClone = false,
  ): void {
    const el = this.element(index, side, asClone);
    if (el === null) return;
    el.classList.toggle(CLASS.flat, place.pose === "flat");
    el.classList.toggle(CLASS.turning, place.pose === "turning");
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
      zIndex: place.zIndex,
      left: "0",
      top: "0",
      ...this.pageSize(rect),
      transformOrigin: `${at.origin.x}px ${at.origin.y}px`,
      clipPath: polygon,
      transform: `translate3d(${at.translate.x}px, ${at.translate.y}px, 0) rotate(${this.axes.angle(angle)}rad)`,
    });
  }

  /** A board swinging about the spine, in the air. */
  private drawHard(index: number, side: Side, angle: number, zIndex: string, rect: BookRect): void {
    const el = this.element(index, side);
    if (el === null) return;
    el.classList.remove(CLASS.flat);
    el.classList.add(CLASS.turning);
    const spine = rect.left + rect.width / 2;
    // A page turns about its spine edge: the left page's right edge, the right page's left edge.
    const at = this.placement(
      { x: side === "left" ? rect.left : spine, y: rect.top },
      side === "left" ? { x: rect.pageWidth, y: 0 } : { x: 0, y: 0 },
      rect.pageWidth,
    );
    applyPageStyle(el, {
      position: "absolute",
      display: "block",
      zIndex,
      left: "0",
      top: "0",
      ...this.pageSize(rect),
      backfaceVisibility: "hidden",
      clipPath: "none",
      transformOrigin: `${at.origin.x}px ${at.origin.y}px`,
      transform: `translate3d(${at.translate.x}px, ${at.translate.y}px, 0) ${this.spin(angle)}`,
    });
  }

  // ---- shadows --------------------------------------------------------------------------------

  /** `flipping` is the part of the turning page the inner shadow may fall on. */
  private drawSoftShadows(
    shadows: Shadows,
    shadow: ShadowData,
    flipping: readonly Point[],
    rect: BookRect,
    zIndex: string,
  ): void {
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
      return `display: block; z-index: ${zIndex}; width: ${size.width}px; height: ${size.height}px; background: linear-gradient(${gradient}); transform-origin: ${to.origin.x}px ${to.origin.y}px; transform: translate3d(${to.translate.x}px, ${to.translate.y}px, 0) rotate(${this.axes.angle(angle)}rad); clip-path: ${clip};`;
    };

    shadows.outer.style.cssText = place(
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
    shadows.inner.style.cssText = place(
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
    shadows: Shadows,
    shadow: ShadowData,
    rect: BookRect,
    band: (layer: "hardShadow" | "hardInnerShadow") => string,
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
    shadows.hardInner.style.cssText = showInner
      ? `${common} z-index: ${band("hardInnerShadow")}; background: linear-gradient(${this.toward("right")}, rgba(0, 0, 0, ${(shadow.opacity * progress) / 100}) 5%, rgba(0, 0, 0, 0) 100%); transform: translate3d(0, 0, 0)${flipped ? "" : ` ${this.spin(180)}`};`
      : "display: none";
    shadows.hardOuter.style.cssText = showOuter
      ? `${common} z-index: ${band("hardShadow")}; background: linear-gradient(${this.toward("left")}, rgba(0, 0, 0, ${shadow.opacity}) 5%, rgba(0, 0, 0, 0) 100%); transform: translate3d(0, 0, 0)${flipped ? ` ${this.spin(180)}` : ""};`
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
  private drawHardCastShadow(
    shadows: Shadows,
    shadow: ShadowData,
    rect: BookRect,
    zIndex: string,
  ): void {
    shadows.hardInner.style.cssText = "display: none";
    // Portrait swings a quarter turn: `progress` 0..100 is flat to upright.
    const lift = (Math.min(100, shadow.progress) / 100) * (Math.PI / 2);
    const reach = rect.pageWidth * Math.cos(lift) + (rect.pageWidth / 3) * Math.sin(lift);
    const spine = rect.left + rect.width / 2;
    const box = this.axes.size({ width: reach, height: rect.height });
    const at = this.placement({ x: spine, y: rect.top }, { x: 0, y: 0 }, reach).translate;
    shadows.hardOuter.style.cssText = `display: block; z-index: ${zIndex}; width: ${box.width}px; height: ${box.height}px; left: ${at.x}px; top: ${at.y}px; background: linear-gradient(${this.toward("right")}, rgba(0, 0, 0, ${shadow.opacity}), rgba(0, 0, 0, 0));`;
  }

  private hideSoftShadows(shadows: Shadows): void {
    shadows.outer.style.cssText = "display: none";
    shadows.inner.style.cssText = "display: none";
  }
  private hideHardShadows(shadows: Shadows): void {
    shadows.hardOuter.style.cssText = "display: none";
    shadows.hardInner.style.cssText = "display: none";
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
    for (const clone of this.clones.values()) clone.remove();
    this.clones.clear();
    this.hidden.clear();
    for (const page of this.pages) this.restore(page.element);
    this.pages = [];
    for (const shadows of this.shadows) for (const el of Object.values(shadows)) el.remove();
    this.shadows.length = 0;
    this.container.classList.remove(CLASS.book, CLASS.bound(this.options.binding));
    const style = this.container.style;
    style.width = "";
    style.minWidth = "";
    style.maxWidth = "";
    style.aspectRatio = "";
  }
}
