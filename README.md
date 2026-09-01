# OpenPageFlip

Maintained successors to [StPageFlip](https://github.com/Nodlik/StPageFlip) and
[react-pageflip](https://github.com/Nodlik/react-pageflip): the same page-turn effect, rebuilt
for 2026 browsers, strict TypeScript and React 19.

| Package | What it is |
| --- | --- |
| [`@openpageflip/core`](packages/core) | Framework-agnostic engine. ESM plus an IIFE build for `<script>` tags. |
| [`@openpageflip/react`](packages/react) | React 19 bindings. |

Both packages are pre-1.0 and under active construction. [`SPEC.md`](SPEC.md) has the plan,
the decisions behind it, and what is still open.

## Working on it

Requires [Bun](https://bun.com) 1.4+ and [Task](https://taskfile.dev). `task --list` shows
every command; `task install` then `task check` runs what CI runs.

## License

MIT. The page-fold geometry derives from Oleg Litovski's StPageFlip, also MIT.
