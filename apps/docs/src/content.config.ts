import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import corePkg from "@openpageflip/core/package.json" with { type: "json" };
import reactPkg from "@openpageflip/react/package.json" with { type: "json" };
import { changelogsLoader } from "starlight-changelogs/loader";

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // Changelogs are the ones Changesets writes at release time, read straight from the packages.
  changelogs: defineCollection({
    loader: changelogsLoader([
      {
        provider: "changeset",
        base: "changelog/core",
        changelog: "../../packages/core/CHANGELOG.md",
        title: corePkg.name,
      },
      {
        provider: "changeset",
        base: "changelog/react",
        changelog: "../../packages/react/CHANGELOG.md",
        title: reactPkg.name,
      },
    ]),
  }),
};
