import { defineRouteMiddleware } from "@astrojs/starlight/route-data";
import { ogImage, packageNames, repoUrl, siteDescription, siteTitle, upstream } from "./site.ts";

/**
 * Every page shares the one Open Graph image (pages/og.png.ts) and describes the project as a
 * schema.org SoftwareSourceCode, so search engines and AI assistants can name it, its licence
 * and its repository without parsing prose. Absolute URLs (the image, the site) need `site`,
 * which is only set on Vercel.
 */
export const onRequest = defineRouteMiddleware(({ site, locals }) => {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: siteTitle,
    description: siteDescription,
    codeRepository: repoUrl,
    programmingLanguage: "TypeScript",
    runtimePlatform: "Web browser",
    license: "https://opensource.org/license/mit",
    isBasedOn: upstream.url,
    identifier: packageNames.map((name) => `https://www.npmjs.com/package/${name}`),
    ...(site === undefined ? {} : { url: site.href }),
  };
  locals.starlightRoute.head.push({
    tag: "script",
    attrs: { type: "application/ld+json" },
    content: JSON.stringify(structuredData),
  });

  if (site === undefined) return;
  const href = new URL(ogImage.path, site).href;
  locals.starlightRoute.head.push(
    { tag: "meta", attrs: { property: "og:image", content: href } },
    { tag: "meta", attrs: { property: "og:image:width", content: String(ogImage.width) } },
    { tag: "meta", attrs: { property: "og:image:height", content: String(ogImage.height) } },
    { tag: "meta", attrs: { name: "twitter:image", content: href } },
    { tag: "meta", attrs: { property: "og:image:alt", content: siteTitle } },
  );
});
