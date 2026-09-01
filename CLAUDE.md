Refer to user-level CLAUDE.md instructions.

This is a public repo - no sensitive stuff can be committed.

- `Taskfile.yml` is the only way anything runs here (`task --list`). Run `task check` before reporting work as done.
- `SPEC.md` holds the goal, decisions and phases, with a status banner that says how settled it is. Read it first; update it when a decision changes.
- The original StPageFlip is the visual oracle: any change to flip geometry or rendering must keep the parity tests green.
- `apps/docs` is the docs site and the demo. Nothing there restates code: the API reference and changelogs are generated at build, and `apps/docs/src/examples` are run live, shown verbatim, tested, and embedded into READMEs by `task docs:readme`. Put new example code there, not in prose.
- Releases are automatic: every change to a package ships with a changeset (`.changeset/README.md`) in the same commit, and a push to `main` versions, publishes and tags it. There is no manual release step.
