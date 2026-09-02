import corePkg from "@openpageflip/core/package.json" with { type: "json" };
import reactPkg from "@openpageflip/react/package.json" with { type: "json" };
import type starlightLlmsTxt from "starlight-llms-txt";
import rootPkg from "../../../package.json" with { type: "json" };

type CustomSet = NonNullable<
  NonNullable<Parameters<typeof starlightLlmsTxt>[0]>["customSets"]
>[number];

/**
 * The site's identity, read from the core package so the docs never restate it. astro.config.ts
 * (Starlight title and description) and the Open Graph image both read from here.
 */
export const siteTitle = "OpenPageFlip";
export const siteDescription = corePkg.description;
/** Where the site is served. The READMEs and the react manifest are synced to it by `task docs:readme`. */
export const siteUrl = corePkg.homepage;
export const repoUrl = corePkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
export const packageNames = [corePkg.name, reactPkg.name] as const;

/**
 * The library this one replaces. Its version is the one the core package vendors for the parity
 * tests, so the prose names the exact release the screenshots are held to.
 */
export const upstream = {
  name: "StPageFlip",
  url: "https://github.com/Nodlik/StPageFlip",
  package: "page-flip",
  version: corePkg.devDependencies["page-flip"],
  reactPackage: "react-pageflip",
} as const;

/**
 * The React major the wrapper needs. Its peer dependency is `catalog:`, so the range lives in the
 * root manifest's catalog; the prose only ever says the major.
 */
const reactRange = rootPkg.workspaces.catalog.react;
const reactMajorMatch = /\d+/.exec(reactRange);
if (reactMajorMatch === null)
  throw new Error(`No React major in the catalog range "${reactRange}"`);
export const reactMajor = reactMajorMatch[0];

/**
 * The text twins of the site that starlight-llms-txt serves for AI assistants, generated from the
 * same pages at every build. The plugin fixes the first two paths; each custom set is served at
 * `/_llms-txt/<slug>.txt`, the slug being the label the GitHub-heading way, so labels here stay one
 * lowercase-safe word. astro.config.ts registers the sets and start/agents.mdx lists the files.
 */
export const llmsTxt = {
  /** The short index: description, then links to the other files. */
  index: "/llms.txt",
  /** Every page, the API reference included. */
  full: "/llms-full.txt",
  /** The quick starts and the examples without the reference: enough to build a book. */
  guides: {
    set: {
      label: "Guides",
      paths: ["start/**", "examples/**"],
      description: "the quick starts and the examples, without the API reference",
    },
    path: "/_llms-txt/guides.txt",
  },
} as const satisfies Record<string, string | { set: CustomSet; path: string }>;

/** A site path as the absolute address an agent working in another repository needs. */
export const absoluteUrl = (path: string): string => new URL(path, siteUrl).href;

/** The one Open Graph image, served by pages/og.png.ts at the size link previews crop to. */
export const ogImage = { path: "/og.png", width: 1200, height: 630 } as const;

/**
 * starlight-llms-txt renders every page again for /llms.txt and friends, with that text file's
 * request. Its renderer cannot run React components, and a text twin has no live demo anyway,
 * so the components that hydrate a demo leave it out of those renders; the code beside it stays.
 */
export const isTextTwin = (url: URL): boolean => url.pathname.endsWith(".txt");
