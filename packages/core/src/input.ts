/**
 * Pointer Events to controller calls. One code path for mouse, touch and pen; the container's
 * `touch-action` decides what the browser keeps (vertical scrolling) and what reaches us.
 */
import type { FlipController } from "./controller.ts";
import type { Point } from "./geometry/point.ts";
import { FlipCorner, FlipDirection, type ResolvedOptions } from "./options.ts";

/** A press shorter than this that travels `swipeDistance` is a swipe rather than a drag. */
const SWIPE_TIMEOUT = 250;

type Press = { readonly id: number; readonly start: Point; readonly startedAt: number };

export function attachInput(
  container: HTMLElement,
  controller: FlipController,
  options: Pick<ResolvedOptions, "swipe" | "swipeDistance" | "hoverCorners" | "ignoreDragOn">,
): () => void {
  let press: Press | null = null;

  const local = (event: PointerEvent): Point => {
    const bounds = container.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const onDown = (event: PointerEvent): void => {
    if (press !== null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(options.ignoreDragOn) !== null)
      return;
    const start = local(event);
    press = { id: event.pointerId, start, startedAt: event.timeStamp };
    try {
      container.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic event has no active pointer to capture; nothing is lost.
    }
    controller.pointerDown(start);
    if (event.pointerType === "mouse") event.preventDefault();
  };

  const onMove = (event: PointerEvent): void => {
    if (press !== null) {
      if (event.pointerId === press.id) controller.pointerDrag(local(event));
      return;
    }
    if (event.pointerType === "mouse" && options.hoverCorners) controller.hover(local(event));
  };

  const onUp = (event: PointerEvent): void => {
    if (press === null || event.pointerId !== press.id) return;
    const { start, startedAt } = press;
    press = null;
    const end = local(event);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const quick = event.timeStamp - startedAt < SWIPE_TIMEOUT;
    if (
      options.swipe &&
      quick &&
      Math.abs(dx) > options.swipeDistance &&
      Math.abs(dy) < options.swipeDistance * 2
    ) {
      const rect = controller.bookRect;
      const corner = start.y - rect.top < rect.height / 2 ? FlipCorner.top : FlipCorner.bottom;
      void controller.swipe(dx > 0 ? FlipDirection.back : FlipDirection.forward, corner);
      return;
    }
    controller.pointerUp(end);
  };

  const onCancel = (event: PointerEvent): void => {
    if (press === null || event.pointerId !== press.id) return;
    press = null;
    controller.pointerCancel();
  };

  const onLeave = (event: PointerEvent): void => {
    if (press === null && event.pointerType === "mouse") controller.hoverEnd();
  };

  container.addEventListener("pointerdown", onDown);
  container.addEventListener("pointermove", onMove, { passive: true });
  container.addEventListener("pointerup", onUp);
  container.addEventListener("pointercancel", onCancel);
  container.addEventListener("pointerleave", onLeave);

  return () => {
    container.removeEventListener("pointerdown", onDown);
    container.removeEventListener("pointermove", onMove);
    container.removeEventListener("pointerup", onUp);
    container.removeEventListener("pointercancel", onCancel);
    container.removeEventListener("pointerleave", onLeave);
  };
}
