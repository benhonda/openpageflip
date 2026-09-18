/**
 * Mounts the original `page-flip` and this library in identical stages, drives them to the same
 * state, and compares screenshots pixel by pixel. Everything runs inside the test browser.
 */

import { PageFlip } from "page-flip";
import { commands, page } from "vitest/browser";
import { type Book, type CreateBookOptions, createBook } from "../../src/index.ts";
import "../../src/styles.css";

export type Pos = { x: number; y: number };

export const PAGE = { width: 250, height: 350 } as const;

export function frames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const step = (): void => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const PAGE_STYLE_ID = "parity-page-style";

/**
 * Six distinct pages: solid colour, dark border, big number, so clipping and rotation
 * differences show. Styled through a class, because both libraries own the inline style.
 */
export function makePages(count = 6, hard: readonly number[] = []): HTMLElement[] {
  if (document.getElementById(PAGE_STYLE_ID) === null) {
    const style = document.createElement("style");
    style.id = PAGE_STYLE_ID;
    style.textContent = `
      .parity-page { border: 3px solid #222; display: flex; align-items: center; justify-content: center; font: 700 64px sans-serif; color: #222; }
      ${Array.from({ length: 8 }, (_, i) => `.parity-page-${i} { background: hsl(${i * 55}, 70%, 78%); }`).join("\n")}
    `;
    document.head.append(style);
  }
  return Array.from({ length: count }, (_, i) => {
    const el = document.createElement("div");
    el.className = `parity-page parity-page-${i}`;
    el.textContent = String(i + 1);
    if (hard.includes(i)) el.dataset["density"] = "hard";
    return el;
  });
}

export function makeStage(width: number): HTMLElement {
  document.body.style.margin = "0";
  document.body.style.background = "#8a8a8a";
  const stage = document.createElement("div");
  stage.style.cssText = `width: ${width}px; margin: 0; padding: 0; position: relative; left: 0; top: 0;`;
  const container = document.createElement("div");
  stage.append(container);
  document.body.append(stage);
  return stage;
}

export type OriginalSetup = { stage: HTMLElement; book: PageFlip };

export function mountOriginal(
  stageWidth: number,
  pages: HTMLElement[],
  settings: { cover?: boolean; flipDuration?: number } = {},
): OriginalSetup {
  const stage = makeStage(stageWidth);
  const container = stage.firstElementChild as HTMLElement;
  const book = new PageFlip(container, {
    width: PAGE.width,
    height: PAGE.height,
    size: "fixed",
    showCover: settings.cover ?? false,
    flippingTime: settings.flipDuration ?? 1000,
    usePortrait: true,
    drawShadow: true,
    maxShadowOpacity: 1,
    showPageCorners: true,
  });
  container.append(...pages);
  book.loadFromHTML(pages);
  return { stage, book };
}

export type OursSetup = { stage: HTMLElement; container: HTMLElement; book: Book };

export function mountOurs(
  stageWidth: number,
  pages: HTMLElement[],
  options: Partial<CreateBookOptions> = {},
): OursSetup {
  const stage = makeStage(stageWidth);
  const container = stage.firstElementChild as HTMLElement;
  container.append(...pages);
  // The oracle's look, not this library's defaults: its shadows run at full strength (as
  // `mountOriginal` sets them) and it draws no edge on the turning page.
  container.style.setProperty("--opf-page-edge", "transparent");
  const book = createBook(container, {
    width: PAGE.width,
    height: PAGE.height,
    shadowOpacity: 1,
    ...options,
  });
  return { stage, container, book };
}

/** Real-shaped pointer events, container-relative coordinates. */
export function pointer(
  container: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup",
  pos: Pos,
  pressed = true,
): void {
  const bounds = container.getBoundingClientRect();
  container.dispatchEvent(
    new PointerEvent(type, {
      clientX: bounds.left + pos.x,
      clientY: bounds.top + pos.y,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: type === "pointermove" ? -1 : 0,
      buttons: pressed ? 1 : 0,
      bubbles: true,
      cancelable: true,
    }),
  );
}

async function capture(element: Element): Promise<ImageData> {
  const base64 = await page.screenshot({ element, save: false });
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2d context");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export type Comparison = { mismatch: number; total: number; ratio: number };

/** A stage-relative area in CSS pixels that is left out of a comparison. */
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Pixels whose colour differs by more than a rounding error, as a fraction of the image.
 * `ignore` areas (in image pixels) count toward neither and are greyed out in the diff.
 */
function compare(
  a: ImageData,
  b: ImageData,
  ignore: readonly Rect[],
): Comparison & { diff: ImageData } {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`screenshot sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const ignored = (x: number, y: number): boolean =>
    ignore.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  const diff = new ImageData(a.width, a.height);
  let mismatch = 0;
  let total = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const pixel = i / 4;
    if (ignored(pixel % a.width, Math.floor(pixel / a.width))) {
      diff.data[i] = diff.data[i + 1] = diff.data[i + 2] = 120;
      diff.data[i + 3] = 255;
      continue;
    }
    total++;
    const delta = Math.max(
      Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0)),
      Math.abs((a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0)),
      Math.abs((a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0)),
    );
    const bad = delta > 40;
    if (bad) mismatch++;
    diff.data[i] = bad ? 255 : (a.data[i] ?? 0) / 3 + 170;
    diff.data[i + 1] = bad ? 0 : (a.data[i + 1] ?? 0) / 3 + 170;
    diff.data[i + 2] = bad ? 0 : (a.data[i + 2] ?? 0) / 3 + 170;
    diff.data[i + 3] = 255;
  }
  return { mismatch, total, ratio: mismatch / total, diff };
}

function toPng(image: ImageData): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no 2d context");
  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png").split(",")[1] ?? "";
}

/**
 * Screenshot two stages, one after the other. One stage is on screen at a time, so both rasterise
 * at the same position; a hidden element cannot be captured, so this has to be sequential.
 */
async function captureBoth(
  first: HTMLElement,
  second: HTMLElement,
): Promise<[ImageData, ImageData]> {
  second.style.visibility = "hidden";
  await frames(1);
  const a = await capture(first);
  second.style.visibility = "visible";
  first.style.visibility = "hidden";
  await frames(1);
  const b = await capture(second);
  first.style.visibility = "visible";
  return [a, b];
}

/**
 * On a mismatch beyond `tolerance`, both images and a red-marked diff are written under
 * `__screenshots__/<dir>/` next to the test so a person can look.
 */
async function report(
  dir: string,
  name: string,
  a: ImageData,
  b: ImageData,
  result: Comparison & { diff: ImageData },
  tolerance: number,
): Promise<void> {
  console.info(`${dir} ${name}: ${(result.ratio * 100).toFixed(3)}% of pixels differ`);
  if (result.ratio <= tolerance) return;
  const base = `__screenshots__/${dir}/${name}`;
  await Promise.all([
    commands.writeFile(`${base}.a.png`, toPng(a), { encoding: "base64" }),
    commands.writeFile(`${base}.b.png`, toPng(b), { encoding: "base64" }),
    commands.writeFile(`${base}.diff.png`, toPng(result.diff), { encoding: "base64" }),
  ]);
  throw new Error(
    `${name}: ${result.mismatch} of ${result.total} pixels differ (${(result.ratio * 100).toFixed(2)}%, tolerance ${(tolerance * 100).toFixed(2)}%). Screenshots written to ${base}.*.png`,
  );
}

/**
 * Screenshot both stages and compare. `ignore` names stage areas (CSS pixels) where the two are
 * known to differ on purpose.
 */
export async function expectVisualParity(
  name: string,
  original: HTMLElement,
  ours: HTMLElement,
  tolerance = 0.005,
  ignore: readonly Rect[] = [],
): Promise<Comparison> {
  const [a, b] = await captureBoth(original, ours);
  const scale = a.width / original.getBoundingClientRect().width;
  const result = compare(
    a,
    b,
    ignore.map((r) => ({
      x: r.x * scale,
      y: r.y * scale,
      width: r.width * scale,
      height: r.height * scale,
    })),
  );
  await report("parity", name, a, b, result, tolerance);
  return result;
}

/**
 * Where a pixel of the reference image is found in the other: given `x, y` in the reference
 * (of the given size), the source pixel in the image being remapped.
 */
export type Remap = (x: number, y: number, size: { width: number; height: number }) => Pos;

/** The image seen through `remap`, in the reference's `width` x `height`. */
function remapImage(image: ImageData, width: number, height: number, remap: Remap): ImageData {
  const out = new ImageData(width, height);
  const size = { width, height };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = remap(x, y, size);
      const from = (source.y * image.width + source.x) * 4;
      const to = (y * width + x) * 4;
      out.data[to] = image.data[from] ?? 0;
      out.data[to + 1] = image.data[from + 1] ?? 0;
      out.data[to + 2] = image.data[from + 2] ?? 0;
      out.data[to + 3] = image.data[from + 3] ?? 0;
    }
  }
  return out;
}

/**
 * Every binding is the left-bound book seen from another side. Screenshot both stages and compare
 * the left-bound one with the other seen through `remap`, pixel for pixel.
 */
export async function expectParityUnder(
  name: string,
  leftBound: HTMLElement,
  other: HTMLElement,
  remap: Remap,
  tolerance = 0.005,
): Promise<Comparison> {
  const [a, b] = await captureBoth(leftBound, other);
  const seen = remapImage(b, a.width, a.height, remap);
  const result = compare(a, seen, []);
  await report("binding", name, a, seen, result, tolerance);
  return result;
}
