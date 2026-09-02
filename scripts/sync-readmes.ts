/**
 * Keeps the READMEs and the package manifests from restating what is defined elsewhere.
 *
 * A README code block marked like this is rewritten from the docs example it names, so the
 * README is never a second copy of the demo:
 *
 *   <!-- example: apps/docs/src/examples/core/quickstart.ts -->
 *   ```ts
 *   (anything; rewritten from the file)
 *   ```
 *   <!-- /example -->
 *
 * A span marked `<!-- homepage -->...<!-- /homepage -->` is rewritten to a bold link to the docs
 * site, whose one address is `homepage` in packages/core/package.json (the docs site itself reads
 * it from there). The other packages' `homepage` fields are set to the same address.
 *
 * `bun scripts/sync-readmes.ts` rewrites everything; `--check` only reports what is out of date
 * and exits 1, which is what `task check` runs.
 */
import { readFile, writeFile } from "node:fs/promises";
import { Glob } from "bun";
import corePkg from "../packages/core/package.json" with { type: "json" };

const check = process.argv.includes("--check");
const root = new URL("..", import.meta.url);
const exampleBlock = /<!-- example: (\S+) -->\n```\w*\n[\s\S]*?```\n<!-- \/example -->/g;
const homepageSpan = /<!-- homepage -->.*?<!-- \/homepage -->/g;
const homepage = corePkg.homepage;
const homepageLink = `<!-- homepage -->**[${new URL(homepage).host}](${homepage})**<!-- /homepage -->`;

let stale = 0;

/** Writes `after` over `path` unless it is unchanged; in `--check` mode only reports the drift. */
async function sync(path: string, before: string, after: string, what: string): Promise<void> {
  if (after === before) return;
  stale += 1;
  if (check) {
    console.error(`${path} is out of date with ${what}: run \`task docs:readme\``);
  } else {
    await writeFile(new URL(path, root), after);
    console.log(`updated ${path}`);
  }
}

const readmes = [
  "README.md",
  ...new Glob("{packages,apps}/*/README.md").scanSync({ cwd: root.pathname }),
];
for (const readme of readmes) {
  const before = await readFile(new URL(readme, root), "utf8");
  const examples = await Promise.all(
    [...before.matchAll(exampleBlock)].map(async ([, examplePath]) => {
      if (examplePath === undefined) throw new Error("unreachable: the group is not optional");
      const source = await readFile(new URL(examplePath, root), "utf8");
      const lang = examplePath.slice(examplePath.lastIndexOf(".") + 1);
      return `<!-- example: ${examplePath} -->\n\`\`\`${lang}\n${source}\`\`\`\n<!-- /example -->`;
    }),
  );
  const after = before
    .replace(exampleBlock, () => {
      const next = examples.shift();
      if (next === undefined) throw new Error(`${readme}: fewer replacements than blocks`);
      return next;
    })
    .replace(homepageSpan, homepageLink);
  await sync(readme, before, after, "its examples or the docs address");
}

for (const manifest of new Glob("packages/*/package.json").scanSync({ cwd: root.pathname })) {
  if (manifest === "packages/core/package.json") continue;
  const before = await readFile(new URL(manifest, root), "utf8");
  const pkg: { homepage?: string } = JSON.parse(before);
  const after = `${JSON.stringify({ ...pkg, homepage }, null, 2)}\n`;
  await sync(manifest, before, after, "the core package's homepage");
}

if (check && stale > 0) process.exit(1);
if (stale === 0) console.log("every README and manifest matches its sources");
