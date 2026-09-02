import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import corePkg from "@openpageflip/core/package.json" with { type: "json" };
import reactPkg from "@openpageflip/react/package.json" with { type: "json" };
import { defineConfig } from "astro/config";
import starlightChangelogs, { makeChangelogsSidebarLinks } from "starlight-changelogs";
import starlightLinksValidator from "starlight-links-validator";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";
import { workspaceAlias } from "../../workspace-alias.ts";

const repoUrl = corePkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

// Vercel hosts the site at the root of its production domain and tells the build which one.
// Locally there is no `site`, so canonical URLs and the sitemap are only produced on Vercel.
const productionUrl = process.env["VERCEL_PROJECT_PRODUCTION_URL"];

export default defineConfig({
  ...(productionUrl === undefined ? {} : { site: `https://${productionUrl}` }),
  // Dev and preview listen on every interface, so the site is reachable from outside the
  // devcontainer that `task start` runs in. Only the local servers read this.
  server: { host: true },
  // Examples and the reference come from packages/*/src, the same way the tests resolve them.
  vite: { resolve: { alias: workspaceAlias } },
  integrations: [
    react(),
    starlight({
      title: "OpenPageFlip",
      description: corePkg.description,
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
          watch: process.argv.includes("dev"),
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
      ],
    }),
  ],
});
