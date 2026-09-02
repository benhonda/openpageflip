import { defineRouteMiddleware } from "@astrojs/starlight/route-data";
import { ogImage, siteTitle } from "./site.ts";

/**
 * Every page shares the one Open Graph image (pages/og.png.ts). Social networks need an absolute
 * URL, so like the canonical link this only appears when `site` is set, i.e. on Vercel.
 */
export const onRequest = defineRouteMiddleware(({ site, locals }) => {
  if (site === undefined) return;
  const href = new URL(ogImage.path, site).href;
  locals.starlightRoute.head.push(
    { tag: "meta", attrs: { property: "og:image", content: href } },
    { tag: "meta", attrs: { property: "og:image:width", content: String(ogImage.width) } },
    { tag: "meta", attrs: { property: "og:image:height", content: String(ogImage.height) } },
    { tag: "meta", attrs: { property: "og:image:alt", content: siteTitle } },
    { tag: "meta", attrs: { name: "twitter:image", content: href } },
  );
});
