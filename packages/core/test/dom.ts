/** A stage with page elements, and pointer events aimed at it, for the `createBook` suites. */

export function stage(
  width: number,
  pageCount = 6,
): { stage: HTMLElement; container: HTMLElement; pages: HTMLElement[] } {
  const el = document.createElement("div");
  el.style.cssText = `width: ${width}px;`;
  const container = document.createElement("div");
  container.id = "book";
  const pages = Array.from({ length: pageCount }, (_, i) => {
    const page = document.createElement("div");
    page.className = "my-page";
    page.style.cssText = "background: pink;";
    page.textContent = `Page ${i + 1}`;
    return page;
  });
  container.append(...pages);
  el.append(container);
  document.body.append(el);
  return { stage: el, container, pages };
}

export const frames = (n: number): Promise<void> =>
  new Promise((resolve) => {
    let left = n;
    const step = (): void => (--left <= 0 ? resolve() : void requestAnimationFrame(step));
    requestAnimationFrame(step);
  });

/** A pointer event at container-relative `x, y` (the container is `#book`, or the target). */
export function pointer(
  target: Element,
  type: string,
  x: number,
  y: number,
  extra: PointerEventInit = {},
): PointerEvent {
  const bounds = (target.closest("#book") ?? target).getBoundingClientRect();
  const event = new PointerEvent(type, {
    clientX: bounds.left + x,
    clientY: bounds.top + y,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: 1,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  target.dispatchEvent(event);
  return event;
}

export const touch: PointerEventInit = { pointerType: "touch" };
