import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import corePkg from "@openpageflip/core/package.json" with { type: "json" };
import reactPkg from "@openpageflip/react/package.json" with { type: "json" };
import { defineConfig } from "astro/config";
import starlightChangelogs, { makeChangelogsSidebarLinks } from "starlight-changelogs";
import starlightLinksValidator from "starlight-links-validator";
import starlightLlmsTxt from "starlight-llms-txt";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";
import { workspaceAlias } from "../../workspace-alias.ts";
import { packageNames, repoUrl, siteDescription, siteTitle } from "./src/site.ts";

// Vercel hosts the site at the root of its production domain and tells the build which one.
// Locally there is no `site`, so canonical URLs and the sitemap are only produced on Vercel.
const productionUrl = process.env["VERCEL_PROJECT_PRODUCTION_URL"];

const isDev = process.argv.includes("dev");

export default defineConfig({
  ...(productionUrl === undefined ? {} : { site: `https://${productionUrl}` }),
  // Dev and preview listen on every interface, so the site is reachable from outside the
  // devcontainer that `task start` runs in. Only the local servers read this.
  server: { host: true },
  // Examples and the reference come from packages/*/src, the same way the tests resolve them.
  vite: {
    resolve: { alias: workspaceAlias },
    // `astro check`, `sync` and `build` each start a Vite server in production mode and, in the
    // default cache dir, overwrite the dev server's pre-bundled deps with production builds. React's
    // jsx-dev-runtime then exports no `jsxDEV` and every island fails to hydrate until the cache
    // is wiped. So they get a cache of their own; only `astro dev` uses Vite's default.
    ...(isDev ? {} : { cacheDir: "node_modules/.vite-astro-build" }),
    // The dev server pre-bundles what src/pages imports; resvg is a native Node addon and must
    // stay a plain import (it only ever runs at build, rendering og.png).
    optimizeDeps: { exclude: ["@resvg/resvg-js"] },
  },
  integrations: [
    react(),
    starlight({
      title: siteTitle,
      description: siteDescription,
      // Adds the Open Graph image tags and the structured data to every page.
      routeMiddleware: "./src/routeData.ts",
      // Footer date from git. Vercel clones ten commits deep, which would date every older page
      // to the same commit, so vercel.json refuses to build a shallow clone.
      lastUpdated: true,
      social: [{ icon: "github", label: "GitHub", href: repoUrl }],
      editLink: { baseUrl: `${repoUrl}/edit/main/apps/docs/` },
      customCss: ["./src/styles/demo.css"],
      components: { SocialIcons: "./src/components/HeaderLinks.astro" },
      sidebar: [
        { label: "Start here", items: [{ autogenerate: { directory: "start" } }] },
        { label: "Examples", items: [{ autogenerate: { directory: "examples" } }] },
        typeDocSidebarGroup,
        {
          label: "Changelog",
          items: makeChangelogsSidebarLinks([
            { type: "all", base: "changelog/core", label: corePkg.name },
            { type: "all", base: "changelog/react", label: reactPkg.name },
          ]),
        },
      ],
      plugins: [
        // The API reference is generated from the packages' TSDoc on every build; nothing under
        // src/content/docs/api is hand-written (it is gitignored). TypeDoc's own options,
        // entry points included, come from ./typedoc.json, which `task typecheck` also runs.
        starlightTypeDoc({
          sidebar: { label: "Reference" },
          // `astro dev` regenerates the reference when a package source changes.
          watch: isDev,
          typeDoc: {
            // "View source" links point at main on GitHub without asking git, which hosted
            // builds clone without a usable remote. Without git, `{path}` is relative to the
            // entry points' common directory, `packages/`.
            disableGit: true,
            sourceLinkTemplate: `${repoUrl}/blob/main/packages/{path}#L{line}`,
          },
        }),
        starlightChangelogs(),
        // Internal links, including those into the generated reference, are checked at build time.
        starlightLinksValidator(),
        // /llms.txt, /llms-full.txt and /llms-small.txt for AI assistants, from the same pages.
        // The plugin needs absolute URLs, so like the sitemap it only exists when `site` is set.
        ...(productionUrl === undefined
          ? []
          : [
              starlightLlmsTxt({
                optionalLinks: [
                  { label: "Source on GitHub", url: repoUrl },
                  ...packageNames.map((name) => ({
                    label: `${name} on npm`,
                    url: `https://www.npmjs.com/package/${name}`,
                  })),
                ],
                // Release notes are the least useful pages for a reader trying to use the library.
                demote: ["changelog/**"],
                exclude: ["changelog/**"],
              }),
            ]),
      ],
    }),
  ],
});
