import { axesFor, type Size } from "./axes.ts";
import { Layout, Orientation, type ResolvedOptions, SizeMode } from "./options.ts";

/**
 * Where the book sits inside its container, in book space (see `axes.ts`): container CSS pixels
 * for a left-bound book, mirrored for a right-bound one, x and y swapped for a top-bound one.
 */
export type BookRect = {
  readonly left: number;
  readonly top: number;
  /** Always two pages wide, even in portrait, where only the right half is visible. */
  readonly width: number;
  readonly height: number;
  readonly pageWidth: number;
};

export type LayoutResult = {
  readonly orientation: Orientation;
  readonly rect: BookRect;
  /** The container as measured on screen, which the renderer needs to place the rect. */
  readonly container: Size;
};

export type LayoutOptions = Pick<
  ResolvedOptions,
  "size" | "width" | "height" | "minWidth" | "maxWidth" | "layout" | "binding"
>;

/**
 * Page size and orientation for a container measured on screen. Same arithmetic as the original,
 * so the book lands on the same pixels; `layout` only overrides the "is the container too narrow"
 * decision. Everything is worked out in book space, so for a top- or bottom-bound book "too
 * narrow" means too short for two pages one above the other. With `autoSize` such a container is
 * always one page wide and two tall, so a vertically bound book that sizes itself is a spread
 * unless `layout` says `single`; a host-sized container can be too short, and then it shows one
 * page. A mirror changes nothing here: the book is centred either way.
 */
export function computeLayout(
  containerWidth: number,
  containerHeight: number,
  options: LayoutOptions,
): LayoutResult {
  const screen = { width: containerWidth, height: containerHeight };
  const axes = axesFor(options.binding, screen);
  const container = axes.size(screen);
  /** A page `width` screen pixels wide, in book space. */
  const pageOf = (width: number) =>
    axes.size({ width, height: (width * options.height) / options.width });
  const page = pageOf(options.width);
  const middle = { x: container.width / 2, y: container.height / 2 };
  const ratio = page.width / page.height;
  const portraitIf = (narrow: boolean): Orientation =>
    options.layout === Layout.single || (options.layout === Layout.auto && narrow)
      ? Orientation.portrait
      : Orientation.landscape;

  // Narrower than two of the narrowest page across the spine: one page.
  const narrowest = options.size === SizeMode.stretch ? pageOf(options.minWidth) : page;
  const orientation = portraitIf(container.width < narrowest.width * 2);
  let pageWidth = page.width;
  let pageHeight = page.height;

  if (options.size === SizeMode.stretch) {
    pageWidth = orientation === Orientation.portrait ? container.width : container.width / 2;
    const widest = pageOf(options.maxWidth).width;
    if (pageWidth > widest) pageWidth = widest;
    pageHeight = pageWidth / ratio;
    if (pageHeight > container.height) {
      pageHeight = container.height;
      pageWidth = pageHeight * ratio;
    }
  }

  // In portrait the visible page is the right half of the two-page rect, centred in the container.
  const left =
    orientation === Orientation.portrait
      ? middle.x - pageWidth / 2 - pageWidth
      : middle.x - pageWidth;

  return {
    orientation,
    container: screen,
    rect: {
      left,
      top: middle.y - pageHeight / 2,
      width: pageWidth * 2,
      height: pageHeight,
      pageWidth,
    },
  };
}
