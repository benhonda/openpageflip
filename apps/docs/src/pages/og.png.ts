import type { APIRoute } from "astro";
import { renderOgImage } from "../og-image.tsx";

/** /og.png: the one Open Graph image, generated at build. routeData.ts points every page at it. */
export const GET: APIRoute = async () =>
  new Response(await renderOgImage(), { headers: { "Content-Type": "image/png" } });
