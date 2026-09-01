import { PageDensity } from "./options.ts";

export type PageModel = {
  readonly element: HTMLElement;
  /** Declared by markup (`data-density="hard"`) or forced by position (covers). */
  density: PageDensity;
  /** Density used while drawing. Differs from `density` for the duration of a flip beside a page of the other kind. */
  drawingDensity: PageDensity;
};

export function createPages(
  elements: readonly HTMLElement[],
  hardByPosition: ReadonlySet<number>,
): PageModel[] {
  return elements.map((element, index) => {
    const density =
      hardByPosition.has(index) || element.dataset["density"] === PageDensity.hard
        ? PageDensity.hard
        : PageDensity.soft;
    return { element, density, drawingDensity: density };
  });
}
