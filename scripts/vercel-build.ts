/**
 * Vercel's build command for apps/docs (`apps/docs/vercel.json`). Vercel's dashboard settings
 * are invisible to the repo, so before building this checks the two the site depends on and
 * fails with the fix when one is missing. Vercel caps `buildCommand` at 256 characters, which
 * is why the checks live here and not in the JSON.
 */
import { $ } from "bun";

const docsDir = new URL("../apps/docs/", import.meta.url);

// astro.config.ts derives `site` (canonical URLs, the sitemap, og:image) from this variable.
if (!process.env["VERCEL_PROJECT_PRODUCTION_URL"]) {
  console.error(
    "VERCEL_PROJECT_PRODUCTION_URL is unset: astro.config.ts needs it for canonical URLs, the sitemap and og:image. " +
      'Turn on "Automatically expose System Environment Variables" in the Vercel project settings.',
  );
  process.exit(1);
}

// Starlight dates every page from git history (`lastUpdated` in astro.config.ts); a shallow
// clone dates them all to the deploy.
const shallow = (await $`git rev-parse --is-shallow-repository`.text()).trim();
if (shallow !== "false") {
  console.error(
    "This is a shallow clone: Starlight dates every page from git history (lastUpdated in astro.config.ts). " +
      "Set VERCEL_DEEP_CLONE=true in the Vercel project environment variables.",
  );
  process.exit(1);
}

await $`bunx astro build`.cwd(docsDir.pathname);
