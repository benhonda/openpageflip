import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import corePkg from "@openpageflip/core/package.json" with { type: "json" };
import reactPkg from "@openpageflip/react/package.json" with { type: "json" };
import { defineConfig } from "astro/config";
import starlightChangelogs, { makeChangelogsSidebarLinks } from "starlight-changelogs";
import starlightLinksValidator from "starlight-links-validator";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";
import { workspaceAlias } from "../../workspace-alias.ts";

// The repository is the single source for where the site lives: GitHub Pages serves
// `https://<owner>.github.io/<repo>/`. A custom domain later means changing only these two lines.
const [owner, repo] = new URL(corePkg.repository.url.replace(/^git\+/, "")).pathname
  .replace(/^\/|\.git$/g, "")
  .split("/");
const repoUrl = `https://github.com/${owner}/${repo}`;

export default defineConfig({
  site: `https://${owner}.github.io`,
  // Links inside content spell this base out (Astro does not rewrite them); the links validator
  // fails the build for any that stop matching.
  base: `/${repo}`,
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
        }),
        starlightChangelogs(),
        // Internal links, including those into the generated reference, are checked at build time.
        starlightLinksValidator(),
      ],
    }),
  ],
});
