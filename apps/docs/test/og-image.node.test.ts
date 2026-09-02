import { expect, test } from "vitest";
import { renderOgImage } from "../src/og-image.tsx";
import { ogImage } from "../src/site.ts";

/** Width and height live in the PNG's IHDR chunk, right after the 8-byte signature. */
const pngSize = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

test("renders the Open Graph image as a 1200×630 PNG", async () => {
  const png = await renderOgImage();
  expect(Buffer.from(png.subarray(0, 8)).toString("hex")).toBe("89504e470d0a1a0a");
  expect(pngSize(png)).toEqual({ width: ogImage.width, height: ogImage.height });
});
