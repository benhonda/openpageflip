/**
 * For every public workspace package: publish the current version if npm lacks it, tag it if the
 * tag is missing, and (in GitHub Actions) create the GitHub release from its changelog entry if
 * that is missing. Each step is skipped when already done, so a rerun finishes whatever an
 * earlier run left undone.
 *
 * Why not `changeset publish` or `bun publish`: Changesets 3 cannot drive Bun, and
 * `bun publish` cannot do npm Trusted Publishing (oven-sh/bun#22423). So we pack with Bun
 * (which rewrites `workspace:` and `catalog:` ranges) and publish the tarball with npm,
 * which attaches provenance automatically under GitHub OIDC.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

type Manifest = {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

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

/** The `## <version>` section of a Changesets changelog, or a pointer to it when absent. */
async function releaseNotes(cwd: string, version: string): Promise<string> {
  const fallback = `See CHANGELOG.md for ${version}.`;
  const path = join(cwd, "CHANGELOG.md");
  if (!existsSync(path)) return fallback;
  const changelog = await Bun.file(path).text();
  const section = changelog
    .split(/^## /m)
    .slice(1)
    .find((candidate) => candidate.split("\n")[0]?.trim() === version);
  return section === undefined ? fallback : section.slice(section.indexOf("\n")).trim() || fallback;
}

const inActions = process.env["GITHUB_ACTIONS"] === "true";
const packagesDir = join(import.meta.dir, "..", "packages");
const created: string[] = [];

type Release = { cwd: string; version: string; tag: string };
const releases: Release[] = [];

type Package = { cwd: string; manifest: Manifest; dependsOn: string[] };
const packages: Package[] = [];
for (const dir of readdirSync(packagesDir)) {
  const cwd = join(packagesDir, dir);
  const manifest: unknown = await Bun.file(join(cwd, "package.json")).json();
  if (!isManifest(manifest)) throw new Error(`${dir}/package.json is missing name or version`);
  if (manifest.private) continue;
  const dependsOn = Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })
    .filter(([, range]) => range.startsWith("workspace:"))
    .map(([name]) => name);
  packages.push({ cwd, manifest, dependsOn });
}
// A package publishes after the workspace packages it depends on, so a consumer never sees a
// version whose peer is not on the registry yet.
const ordered: Package[] = [];
while (ordered.length < packages.length) {
  const next = packages.find(
    (p) =>
      !ordered.includes(p) &&
      p.dependsOn.every((name) => ordered.some((o) => o.manifest.name === name)),
  );
  if (next === undefined) throw new Error("workspace dependency cycle among publishable packages");
  ordered.push(next);
}

for (const { cwd, manifest } of ordered) {
  const tag = `${manifest.name}@${manifest.version}`;
  if (await isPublished(tag)) {
    console.log(`skip publish ${tag}: already on npm`);
  } else {
    console.log(`publish ${tag}`);
    const tarball = join(
      cwd,
      `${manifest.name.replace("@", "").replace("/", "-")}-${manifest.version}.tgz`,
    );
    await $`bun pm pack --filename ${tarball}`.cwd(cwd);
    await $`npm publish ${tarball} --access public`.cwd(cwd);
  }

  const tagged = (await $`git tag --list ${tag}`.quiet()).stdout.toString().trim() === tag;
  if (tagged) {
    console.log(`skip tag ${tag}: exists`);
  } else {
    await $`git tag ${tag}`;
    created.push(tag);
  }
  releases.push({ cwd, version: manifest.version, tag });
}

if (!inActions) {
  console.log(
    created.length > 0 ? `tagged locally: ${created.join(", ")} (not pushed)` : "nothing to tag",
  );
} else {
  // Tags go to the remote before releases are created: `gh` refuses a tag it cannot see there.
  if (created.length > 0) await $`git push origin --tags`;
  for (const { cwd, version, tag } of releases) {
    const exists = (await $`gh release view ${tag}`.quiet().nothrow()).exitCode === 0;
    if (exists) {
      console.log(`skip release ${tag}: exists`);
      continue;
    }
    const notes = await releaseNotes(cwd, version);
    await $`gh release create ${tag} --verify-tag --title ${tag} --notes ${notes}`;
    console.log(`New tag: ${tag}`);
  }
}
