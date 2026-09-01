Refer to user-level CLAUDE.md instructions.

This is a public repo - no sensitive stuff can be committed.

- `Taskfile.yml` is the only way anything runs here (`task --list`). Run `task check` before reporting work as done.
- `SPEC.md` holds the goal, decisions and phases, with a status banner that says how settled it is. Read it first; update it when a decision changes.
- The original StPageFlip is the visual oracle: any change to flip geometry or rendering must keep the parity tests green.
- Releases are automatic: every change to a package ships with a changeset (`.changeset/README.md`) in the same commit, and a push to `main` versions, publishes and tags it. There is no manual release step.
