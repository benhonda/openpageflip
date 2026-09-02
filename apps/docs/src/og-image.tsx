import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import favicon from "../public/favicon.svg?raw";
import { ogImage, packageNames, siteDescription, siteTitle } from "./site.ts";

// Warm brand palette, the same one the demo pages and the favicon use (styles/demo.css).
const cream = "#fbf6ee";
const ink = "#3b2f24";
const brown = "#6f4a2d";
const muted = "#8a7461";

const inter = (weight: 400 | 700) =>
  readFile(
    fileURLToPath(import.meta.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`)),
  ).then((data) => ({ name: "Inter", data, weight, style: "normal" as const }));

/**
 * Renders the site's Open Graph image as a PNG. Satori lays out the JSX below with flexbox and
 * emits SVG (every box must be `display: flex`, its one rule); resvg rasterises it. The favicon is
 * embedded as-is, so the mark in link previews is the one in the browser tab.
 */
export async function renderOgImage(): Promise<Uint8Array<ArrayBuffer>> {
  const [regular, bold] = await Promise.all([inter(400), inter(700)]);
  const mark = `data:image/svg+xml;base64,${Buffer.from(favicon).toString("base64")}`;

  const svg = await satori(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: cream,
        color: ink,
        fontFamily: "Inter",
      }}
    >
      <img src={mark} width={128} height={128} alt="" />
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>
          {siteTitle}
        </div>
        <div style={{ fontSize: 34, color: brown, lineHeight: 1.35, maxWidth: 1040 }}>
          {siteDescription}
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 26, color: muted }}>{packageNames.join(" · ")}</div>
    </div>,
    { width: ogImage.width, height: ogImage.height, fonts: [regular, bold] },
  );

  // resvg hands back a Node Buffer; a Response body wants a plain Uint8Array over an ArrayBuffer.
  return new Uint8Array(
    new Resvg(svg, { fitTo: { mode: "width", value: ogImage.width } }).render().asPng(),
  );
}
