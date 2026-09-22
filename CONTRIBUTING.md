# Contributing

Glad you're here. This is a small project with one maintainer, so the rules are short and the answers to "how does X work" mostly live in files you can open rather than in prose here.

## Getting set up

You need [Bun](https://bun.com) 1.4+ and [Task](https://taskfile.dev). Then `task install` and `task check`. `task check` is exactly what CI runs, so if it's green locally it'll be green on the PR. `task --list` shows everything else, and `Taskfile.yml` is the only way anything runs in this repo - if you find yourself typing `bun run` something, there's probably a task for it.

## How changes land

`main` is protected. Everything gets there through a pull request with a green `check`, squash merged, and the maintainer reviews every one (that's what `.github/CODEOWNERS` is for). Fork the repo, branch, open the PR. Workflows on PRs from forks wait for a maintainer to approve the run, which is just a click on our side, so don't worry if CI looks stuck at first.

A couple of things CI will hold you to:

- **Changes to `packages/*` need a changeset** in the same PR. `task changeset` writes one, and `.changeset/README.md` explains why: a push to `main` with changesets in it is a release, automatically, so the changeset is the release note. If you forget, tick "Allow edits by maintainers" on the PR and I'll add it.
- **Flip geometry and rendering are held to the original.** [StPageFlip](https://github.com/Nodlik/StPageFlip) is the visual oracle, and the parity tests in `packages/core/test` compare against it pixel for pixel. A change in that area has to keep them green.
- **Example code goes in `apps/docs/src/examples`,** not in docs prose. Those examples run live on the docs site, are tested, and get copied into the READMEs by `task docs:readme`.

## Before you build something big

`SPEC.md` has the goal, the decisions already made and the reasons behind them, and what's still open. Honestly, for anything beyond a bug fix, opening an issue first to check it fits is the fastest path - the spec has a few "no, and here's why" entries that would be a shame to discover after the work.

## Coding agents

If you're using Claude Code, Cursor or similar, `CLAUDE.md` at the root is written for them, and the docs site has a page on pointing an agent at the right docs.
