import corePkg from "@openpageflip/core/package.json" with { type: "json" };
import reactPkg from "@openpageflip/react/package.json" with { type: "json" };

/**
 * The site's identity, read from the core package so the docs never restate it. astro.config.ts
 * (Starlight title and description) and the Open Graph image both read from here.
 */
export const siteTitle = "OpenPageFlip";
export const siteDescription = corePkg.description;
export const repoUrl = corePkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
export const packageNames = [corePkg.name, reactPkg.name] as const;

/** The one Open Graph image, served by pages/og.png.ts at the size link previews crop to. */
export const ogImage = { path: "/og.png", width: 1200, height: 630 } as const;

/**
 * starlight-llms-txt renders every page again for /llms.txt and friends, with that text file's
 * request. Its renderer cannot run React components, and a text twin has no live demo anyway,
 * so the components that hydrate a demo leave it out of those renders; the code beside it stays.
 */
export const isTextTwin = (url: URL): boolean => url.pathname.endsWith(".txt");
