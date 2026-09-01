// Tests import the stylesheet for its side effect; Vite serves it, TypeScript only needs the module to exist.
declare module "*.css";

// The original library, used untouched as the visual oracle. It ships no types; this is the
// slice of its API the parity harness drives.
declare module "page-flip" {
  export type Pos = { x: number; y: number };
  export class PageFlip {
    constructor(el: HTMLElement, settings: Record<string, unknown>);
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    turnToPage(page: number): void;
    flipNext(corner?: "top" | "bottom"): void;
    flipPrev(corner?: "top" | "bottom"): void;
    startUserTouch(pos: Pos): void;
    userMove(pos: Pos, isTouch: boolean): void;
    userStop(pos: Pos, isSwipe?: boolean): void;
    getCurrentPageIndex(): number;
    getOrientation(): "portrait" | "landscape";
    destroy(): void;
  }
}
