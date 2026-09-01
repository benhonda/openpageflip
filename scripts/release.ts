/**
 * Publishes every public workspace package whose local version is not on npm yet.
 *
 * Why not `changeset publish` or `bun publish`: Changesets 3 cannot drive Bun, and
 * `bun publish` cannot do npm Trusted Publishing (oven-sh/bun#22423). So we pack with Bun
 * (which rewrites `workspace:` and `catalog:` ranges) and publish the tarball with npm,
 * which attaches provenance automatically under GitHub OIDC. Tags come from
 * `changeset git-tag`; the "New tag:" lines let changesets/action create GitHub releases.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

type Manifest = { name: string; version: string; private?: boolean };

function isManifest(value: unknown): value is Manifest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "name") === "string" &&
    typeof Reflect.get(value, "version") === "string"
  );
}

/** True when `name@version` is already on the registry. Throws on anything but a clean 404. */
async function isPublished(spec: string): Promise<boolean> {
  const result = await $`npm view ${spec} version`.quiet().nothrow();
  if (result.exitCode === 0) return result.stdout.toString().trim().length > 0;
  if (result.stderr.toString().includes("E404")) return false;
  throw new Error(`npm view ${spec} failed:\n${result.stderr.toString()}`);
}

const packagesDir = join(import.meta.dir, "..", "packages");
const published: string[] = [];

for (const dir of readdirSync(packagesDir)) {
  const cwd = join(packagesDir, dir);
  const manifest: unknown = await Bun.file(join(cwd, "package.json")).json();
  if (!isManifest(manifest)) throw new Error(`${dir}/package.json is missing name or version`);
  if (manifest.private) continue;

  const spec = `${manifest.name}@${manifest.version}`;
  if (await isPublished(spec)) {
    console.log(`skip ${spec}: already on npm`);
    continue;
  }

  console.log(`publish ${spec}`);
  const tarball = join(
    cwd,
    `${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`,
  );
  await $`bun pm pack --filename ${tarball}`.cwd(cwd);
  await $`npm publish ${tarball} --access public`.cwd(cwd);
  published.push(spec);
}

if (published.length > 0) {
  await $`bunx changeset git-tag`;
  for (const spec of published) console.log(`New tag: ${spec}`);
} else {
  console.log("nothing to publish");
}
