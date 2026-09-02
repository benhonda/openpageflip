/**
 * Vercel's build command for apps/docs (`apps/docs/vercel.json`). Vercel's dashboard settings
 * are invisible to the repo, so before building this checks the one the site depends on and
 * fails with the fix when it is missing. Vercel caps `buildCommand` at 256 characters, which
 * is why the check lives here and not in the JSON.
 */
import { $ } from "bun";

const docsDir = new URL("../apps/docs/", import.meta.url);

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
