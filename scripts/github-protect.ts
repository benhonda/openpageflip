/**
 * Applies this repo's GitHub-side contribution settings so they are reproducible instead of
 * clicked together: the `main` ruleset from .github/rulesets/main.json (create or update by
 * name) with the repo owner and the release GitHub App as its bypass actors, and the merge
 * settings (squash only, delete head branches). Needs `gh auth login` and RELEASE_APP_ID, the
 * numeric App ID from the release App's settings page (the workflow uses its Client ID; both
 * are shown there). Fork-workflow approval has no API and stays a UI setting; the script says so.
 */
import { join } from "node:path";
import { $ } from "bun";

type Ruleset = { name: string; bypass_actors: unknown[] };
/** What the list endpoint returns per ruleset: identity only, no rules or bypass actors. */
type RulesetSummary = { id: number; name: string };

function isRulesetSummary(value: unknown): value is RulesetSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "id") === "number" &&
    typeof Reflect.get(value, "name") === "string"
  );
}

function isRuleset(value: unknown): value is Ruleset {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "name") === "string" &&
    Array.isArray(Reflect.get(value, "bypass_actors"))
  );
}

const appId = Number(process.env["RELEASE_APP_ID"]);
if (!Number.isInteger(appId) || appId <= 0) {
  throw new Error(
    "RELEASE_APP_ID must be the release GitHub App's numeric App ID, e.g. RELEASE_APP_ID=123456 task github:protect",
  );
}

if ((await $`gh auth status`.quiet().nothrow()).exitCode !== 0) {
  throw new Error("gh is not logged in: run `gh auth login` first");
}
const repo = (await $`gh repo view --json nameWithOwner --jq .nameWithOwner`.text()).trim();
const ownerId = Number((await $`gh api user --jq .id`.text()).trim());

const template: unknown = await Bun.file(
  join(import.meta.dir, "..", ".github", "rulesets", "main.json"),
).json();
if (!isRuleset(template)) throw new Error(".github/rulesets/main.json is not a ruleset");
const { $comment: _, ...ruleset } = template as Ruleset & { $comment?: string };
ruleset.bypass_actors = [
  { actor_id: ownerId, actor_type: "User", bypass_mode: "always" },
  { actor_id: appId, actor_type: "Integration", bypass_mode: "always" },
];

const existing: unknown = await $`gh api repos/${repo}/rulesets`.json();
const current = Array.isArray(existing)
  ? existing.filter(isRulesetSummary).find((r) => r.name === ruleset.name)
  : undefined;
const body = JSON.stringify(ruleset);
if (current === undefined) {
  await $`gh api -X POST repos/${repo}/rulesets --input - < ${new Response(body)}`.quiet();
  console.log(`created ruleset "${ruleset.name}" on ${repo}`);
} else {
  await $`gh api -X PUT repos/${repo}/rulesets/${current.id} --input - < ${new Response(body)}`.quiet();
  console.log(`updated ruleset "${ruleset.name}" (#${current.id}) on ${repo}`);
}

await $`gh api -X PATCH repos/${repo} -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true -F squash_merge_commit_title=PR_TITLE -F squash_merge_commit_message=PR_BODY`.quiet();
console.log(
  `merge settings on ${repo}: squash only, PR title as the commit subject, head branches deleted on merge`,
);

console.log(
  `still UI-only: Settings → Actions → General → "Approval for running fork pull request workflows" → Require approval for all external contributors (https://github.com/${repo}/settings/actions)`,
);
