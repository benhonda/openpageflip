import { Layout, Orientation, type ResolvedOptions, SizeMode } from "./options.ts";

/** Where the book sits inside its container, in container CSS pixels. */
export type BookRect = {
  readonly left: number;
  readonly top: number;
  /** Always two pages wide, even in portrait, where only the right half is visible. */
  readonly width: number;
  readonly height: number;
  readonly pageWidth: number;
};

export type LayoutResult = { readonly orientation: Orientation; readonly rect: BookRect };

export type LayoutOptions = Pick<
  ResolvedOptions,
  "size" | "width" | "height" | "minWidth" | "maxWidth" | "layout"
>;

/**
 * Page size and orientation for a container. Same arithmetic as the original, so the book lands
 * on the same pixels; `layout` only overrides the "is the container too narrow" decision.
 */
export function computeLayout(
  containerWidth: number,
  containerHeight: number,
  options: LayoutOptions,
): LayoutResult {
  const middle = { x: containerWidth / 2, y: containerHeight / 2 };
  const ratio = options.width / options.height;
  const portraitIf = (narrow: boolean): Orientation =>
    options.layout === Layout.single || (options.layout === Layout.auto && narrow)
      ? Orientation.portrait
      : Orientation.landscape;

  let orientation: Orientation;
  let pageWidth = options.width;
  let pageHeight = options.height;

  if (options.size === SizeMode.stretch) {
    orientation = portraitIf(containerWidth < options.minWidth * 2);
    pageWidth = orientation === Orientation.portrait ? containerWidth : containerWidth / 2;
    if (pageWidth > options.maxWidth) pageWidth = options.maxWidth;
    pageHeight = pageWidth / ratio;
    if (pageHeight > containerHeight) {
      pageHeight = containerHeight;
      pageWidth = pageHeight * ratio;
    }
  } else {
    orientation = portraitIf(containerWidth < pageWidth * 2);
  }

  // In portrait the visible page is the right half of the two-page rect, centred in the container.
  const left =
    orientation === Orientation.portrait
      ? middle.x - pageWidth / 2 - pageWidth
      : middle.x - pageWidth;

  return {
    orientation,
    rect: {
      left,
      top: middle.y - pageHeight / 2,
      width: pageWidth * 2,
      height: pageHeight,
      pageWidth,
    },
  };
}
