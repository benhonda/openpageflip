/**
 * Keeps README code blocks identical to the docs examples they show, so a README is never a
 * second copy. A README marks a block with
 *
 *   <!-- example: apps/docs/src/examples/core/quickstart.ts -->
 *   ```ts
 *   (anything; rewritten from the file)
 *   ```
 *   <!-- /example -->
 *
 * `bun scripts/embed-examples.ts` rewrites every marked block; `--check` only reports blocks that
 * are out of date and exits 1, which is what `task check` runs.
 */
import { readFile, writeFile } from "node:fs/promises";
import { Glob } from "bun";

const check = process.argv.includes("--check");
const root = new URL("..", import.meta.url);
const block = /<!-- example: (\S+) -->\n```\w*\n[\s\S]*?```\n<!-- \/example -->/g;

let stale = 0;
for await (const readme of new Glob("{packages,apps}/*/README.md").scan({ cwd: root.pathname })) {
  const before = await readFile(new URL(readme, root), "utf8");
  const replacements = await Promise.all(
    [...before.matchAll(block)].map(async ([, examplePath]) => {
      if (examplePath === undefined) throw new Error("unreachable: the group is not optional");
      const source = await readFile(new URL(examplePath, root), "utf8");
      const lang = examplePath.slice(examplePath.lastIndexOf(".") + 1);
      return `<!-- example: ${examplePath} -->\n\`\`\`${lang}\n${source}\`\`\`\n<!-- /example -->`;
    }),
  );
  const after = before.replace(block, () => {
    const next = replacements.shift();
    if (next === undefined) throw new Error(`${readme}: fewer replacements than blocks`);
    return next;
  });
  if (after === before) continue;
  stale += 1;
  if (check) {
    console.error(`${readme} is out of date with its examples: run \`task docs:readme\``);
  } else {
    await writeFile(new URL(readme, root), after);
    console.log(`updated ${readme}`);
  }
}

if (check && stale > 0) process.exit(1);
if (stale === 0) console.log("every README matches its examples");
