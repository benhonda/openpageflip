/**
 * Draws a `Frame` with plain DOM: absolutely positioned page elements, `clip-path` polygons for
 * soft pages, `rotateY` for hard ones, and four gradient elements for shadows. The style strings
 * are the original's, so a frame lands on the same pixels; writes happen only when a frame is
 * handed over, never on a timer.
 */

import type { Frame, ShadowData } from "../controller.ts";
import { pageToContainer } from "../coords.ts";
import type { Point, RectPoints } from "../geometry/point.ts";
import { rotatePoint } from "../geometry/point.ts";
import type { BookRect } from "../layout.ts";
import {
  FlipDirection,
  Layout,
  Orientation,
  PageDensity,
  type ResolvedOptions,
  SizeMode,
} from "../options.ts";
import type { PageModel } from "../pages.ts";

const Z = {
  flat: 1,
  bottom: 3,
  hardShadow: 4,
  flipping: 5,
  hardInnerShadow: 5,
  shadow: 10,
} as const;

const CLASS = {
  book: "opf-book",
  page: "opf-page",
  left: "opf-page--left",
  right: "opf-page--right",
  flat: "opf-page--flat",
  soft: "opf-page--soft",
  hard: "opf-page--hard",
  shadow: "opf-shadow",
} as const;

type Side = "left" | "right";

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
  "autoSize" | "size" | "width" | "height" | "minWidth" | "maxWidth" | "layout"
>;

type Saved = { readonly cssText: string; readonly className: string };

export class DomRenderer {
  private readonly shadows: Record<"outer" | "inner" | "hardOuter" | "hardInner", HTMLDivElement>;
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

  constructor(container: HTMLElement, options: SizingOptions) {
    this.container = container;
    this.options = options;
    container.classList.add(CLASS.book);
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
    const { autoSize, size, width, height, minWidth, maxWidth, layout } = this.options;
    if (!autoSize) return;
    // Narrowest: one page unless spreads are forced. Widest: two pages unless single is forced.
    const minAcross = layout === Layout.spread ? 2 : 1;
    const maxAcross = layout === Layout.single ? 1 : 2;
    const style = this.container.style;
    style.width = "100%";
    style.minWidth = `${(size === SizeMode.fixed ? width : minWidth) * minAcross}px`;
    style.maxWidth = `${(size === SizeMode.fixed ? width : maxWidth) * maxAcross}px`;
    style.aspectRatio =
      orientation === Orientation.portrait ? `${width} / ${height}` : `${width * 2} / ${height}`;
  }

  render(frame: Frame): void {
    const { rect, flip } = frame;
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
        this.hidden.add(index);
      }
    }

    const flippingHard =
      flip !== null && this.pages[flip.flipping]?.drawingDensity === PageDensity.hard;

    if (frame.orientation !== Orientation.portrait && frame.left !== null) {
      if (flip !== null && flip.direction === FlipDirection.back && flippingHard) {
        this.drawHard(frame.left, "left", 180 + flip.hardAngle, Z.flipping, rect);
      } else {
        this.drawFlat(frame.left, "left", rect);
      }
    }
    if (frame.right !== null) {
      if (flip !== null && flip.direction === FlipDirection.forward && flippingHard) {
        this.drawHard(frame.right, "right", 180 + flip.hardAngle, Z.flipping, rect);
      } else {
        this.drawFlat(frame.right, "right", rect);
      }
    }

    if (flip === null) {
      this.dropClone();
      this.hideShadows();
      return;
    }
    const liftsFromItself = !flippingHard && flip.flipping === frame.right;
    if (!liftsFromItself) this.dropClone();

    const bottomSide: Side = flip.direction === FlipDirection.back ? "left" : "right";
    if (!(frame.orientation === Orientation.portrait && flip.direction === FlipDirection.back)) {
      if (flippingHard) {
        this.drawHard(flip.bottom, bottomSide, 0, Z.bottom, rect);
      } else {
        this.drawSoft(
          flip.bottom,
          bottomSide,
          flip.fold.bottomClip,
          flip.fold.bottomPagePosition,
          0,
          flip.direction,
          Z.bottom,
          rect,
        );
      }
    }

    const flippingSide: Side =
      flip.direction === FlipDirection.forward && frame.orientation !== Orientation.portrait
        ? "left"
        : "right";
    if (flippingHard) {
      this.drawHard(flip.flipping, flippingSide, flip.hardAngle, Z.flipping, rect);
    } else {
      this.drawSoft(
        flip.flipping,
        flippingSide,
        flip.fold.flippingClip,
        flip.fold.activeCorner,
        flip.fold.angle,
        flip.direction,
        Z.flipping,
        rect,
        liftsFromItself,
      );
    }

    if (flip.shadow === null) {
      this.hideShadows();
    } else if (flippingHard) {
      this.hideSoftShadows();
      // A hard page's shadow falls on the page it lands on. A cover opens onto the empty side of
      // the stage, and the lone last page closes onto it, so there the shadow has nothing to fall
      // on and is skipped. The original painted it on the bare background.
      const landing = flip.direction === FlipDirection.forward ? frame.left : frame.right;
      this.drawHardShadows(flip.shadow, rect, landing !== null);
    } else {
      this.hideHardShadows();
      this.drawSoftShadows(flip.shadow, flip.fold.rect, rect);
    }
  }

  // ---- pages ----------------------------------------------------------------------------------

  private element(index: number, side: Side, asClone = false): HTMLElement | null {
    const page = this.pages[index];
    if (page === undefined) return null;
    const el = asClone ? this.cloneOf(page.element) : page.element;
    // Re-asserted on every draw: a framework may have rewritten the class attribute since.
    el.classList.add(CLASS.page);
    el.classList.toggle(CLASS.hard, page.drawingDensity === PageDensity.hard);
    el.classList.toggle(CLASS.soft, page.drawingDensity === PageDensity.soft);
    el.classList.toggle(CLASS.left, side === "left");
    el.classList.toggle(CLASS.right, side === "right");
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

  private drawFlat(index: number, side: Side, rect: BookRect): void {
    const el = this.element(index, side);
    if (el === null) return;
    el.classList.add(CLASS.flat);
    const left = side === "right" ? rect.left + rect.pageWidth : rect.left;
    applyPageStyle(el, {
      position: "absolute",
      display: "block",
      height: `${rect.height}px`,
      left: `${left}px`,
      top: `${rect.top}px`,
      width: `${rect.pageWidth}px`,
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
    zIndex: number,
    rect: BookRect,
    asClone = false,
  ): void {
    const el = this.element(index, side, asClone);
    if (el === null) return;
    el.classList.remove(CLASS.flat);
    const at = pageToContainer(position, rect, direction);
    const polygon = area
      .map((p) => {
        const local =
          direction === FlipDirection.back
            ? { x: -p.x + position.x, y: p.y - position.y }
            : { x: p.x - position.x, y: p.y - position.y };
        const g = rotatePoint(local, { x: 0, y: 0 }, angle);
        return `${g.x}px ${g.y}px`;
      })
      .join(", ");
    applyPageStyle(el, {
      position: "absolute",
      display: "block",
      zIndex: String(zIndex),
      left: "0",
      top: "0",
      width: `${rect.pageWidth}px`,
      height: `${rect.height}px`,
      transformOrigin: "0 0",
      clipPath: `polygon(${polygon})`,
      transform: `translate3d(${at.x}px, ${at.y}px, 0) rotate(${angle}rad)`,
    });
  }

  private drawHard(index: number, side: Side, angle: number, zIndex: number, rect: BookRect): void {
    const el = this.element(index, side);
    if (el === null) return;
    el.classList.remove(CLASS.flat);
    const spine = rect.left + rect.width / 2;
    applyPageStyle(el, {
      position: "absolute",
      display: "block",
      zIndex: String(zIndex),
      left: "0",
      top: "0",
      width: `${rect.pageWidth}px`,
      height: `${rect.height}px`,
      backfaceVisibility: "hidden",
      clipPath: "none",
      transformOrigin: side === "left" ? `${rect.pageWidth}px 0` : "0 0",
      transform:
        side === "left"
          ? `translate3d(${rect.left}px, ${rect.top}px, 0) rotateY(${angle}deg)`
          : `translate3d(${spine}px, ${rect.top}px, 0) rotateY(${angle}deg)`,
    });
  }

  // ---- shadows --------------------------------------------------------------------------------

  private drawSoftShadows(shadow: ShadowData, pageRect: RectPoints, rect: BookRect): void {
    const forward = shadow.direction === FlipDirection.forward;
    const at = pageToContainer(shadow.pos, rect, shadow.direction);
    const angle = shadow.angle + (3 * Math.PI) / 2;
    const polygon = (points: readonly Point[], translate: number): string =>
      points
        .map((p) => {
          const local = forward
            ? { x: p.x - shadow.pos.x, y: p.y - shadow.pos.y }
            : { x: -p.x + shadow.pos.x, y: p.y - shadow.pos.y };
          const g = rotatePoint(local, { x: translate, y: 100 }, angle);
          return `${g.x}px ${g.y}px`;
        })
        .join(", ");

    const outerTranslate = forward ? 0 : shadow.width;
    const outerClip = polygon(
      [
        { x: 0, y: 0 },
        { x: rect.pageWidth, y: 0 },
        { x: rect.pageWidth, y: rect.height },
        { x: 0, y: rect.height },
      ],
      outerTranslate,
    );
    this.shadows.outer.style.cssText = `display: block; z-index: ${Z.shadow}; width: ${shadow.width}px; height: ${rect.height * 2}px; background: linear-gradient(${forward ? "to right" : "to left"}, rgba(0, 0, 0, ${shadow.opacity}), rgba(0, 0, 0, 0)); transform-origin: ${outerTranslate}px 100px; transform: translate3d(${at.x - outerTranslate}px, ${at.y - 100}px, 0) rotate(${angle}rad); clip-path: polygon(${outerClip});`;

    const innerWidth = (shadow.width * 3) / 4;
    const innerTranslate = forward ? innerWidth : 0;
    const innerClip = polygon(
      [pageRect.topLeft, pageRect.topRight, pageRect.bottomRight, pageRect.bottomLeft],
      innerTranslate,
    );
    this.shadows.inner.style.cssText = `display: block; z-index: ${Z.shadow}; width: ${innerWidth}px; height: ${rect.height * 2}px; background: linear-gradient(${forward ? "to left" : "to right"}, rgba(0, 0, 0, ${shadow.opacity}) 5%, rgba(0, 0, 0, 0.05) 15%, rgba(0, 0, 0, ${shadow.opacity}) 35%, rgba(0, 0, 0, 0) 100%); transform-origin: ${innerTranslate}px 100px; transform: translate3d(${at.x - innerTranslate}px, ${at.y - 100}px, 0) rotate(${angle}rad); clip-path: polygon(${innerClip});`;
  }

  /**
   * Two gradients at the spine. Until the page passes the spine, the inner one lies on the
   * landing side and darkens as the page comes down, and the outer one lies under the lifting
   * page; past the spine they trade places. `landingHasPage` is false when the landing side is
   * empty, and the gradient that would sit there stays hidden.
   */
  private drawHardShadows(shadow: ShadowData, rect: BookRect, landingHasPage: boolean): void {
    const progress = shadow.progress > 100 ? 200 - shadow.progress : shadow.progress;
    const size = Math.min(rect.pageWidth, ((100 - progress) * (2.5 * rect.pageWidth)) / 100 + 20);
    const spine = rect.left + rect.width / 2;
    const flipped =
      (shadow.direction === FlipDirection.forward && shadow.progress > 100) ||
      (shadow.direction === FlipDirection.back && shadow.progress <= 100);
    const pastSpine = shadow.progress > 100;
    const showInner = landingHasPage || pastSpine;
    const showOuter = landingHasPage || !pastSpine;
    const common = `display: block; width: ${size}px; height: ${rect.height}px; left: ${spine}px; top: ${rect.top}px; transform-origin: 0 0;`;
    this.shadows.hardInner.style.cssText = showInner
      ? `${common} z-index: ${Z.hardInnerShadow}; background: linear-gradient(to right, rgba(0, 0, 0, ${(shadow.opacity * progress) / 100}) 5%, rgba(0, 0, 0, 0) 100%); transform: translate3d(0, 0, 0)${flipped ? "" : " rotateY(180deg)"};`
      : "display: none";
    this.shadows.hardOuter.style.cssText = showOuter
      ? `${common} z-index: ${Z.hardShadow}; background: linear-gradient(to left, rgba(0, 0, 0, ${shadow.opacity}) 5%, rgba(0, 0, 0, 0) 100%); transform: translate3d(0, 0, 0)${flipped ? " rotateY(180deg)" : ""};`
      : "display: none";
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
    this.container.classList.remove(CLASS.book);
    const style = this.container.style;
    style.width = "";
    style.minWidth = "";
    style.maxWidth = "";
    style.aspectRatio = "";
  }
}
