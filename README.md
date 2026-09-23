# OpenPageFlip

Maintained successors to [StPageFlip](https://github.com/Nodlik/StPageFlip) and [react-pageflip](https://github.com/Nodlik/react-pageflip): the same page-turn effect, rebuilt for 2026 browsers, strict TypeScript and React 19.

![Pages turning in the Site Report demo from the docs site](.github/assets/demo.webp)

| Package | npm | What it is |
| --- | --- | --- |
| [`@openpageflip/core`](packages/core) | [![npm](https://img.shields.io/npm/v/@openpageflip/core)](https://www.npmjs.com/package/@openpageflip/core) | Framework-agnostic engine. ESM plus an IIFE build for `<script>` tags. |
| [`@openpageflip/react`](packages/react) | [![npm](https://img.shields.io/npm/v/@openpageflip/react)](https://www.npmjs.com/package/@openpageflip/react) | React 19 bindings. |

Docs, live demos, the API reference and changelogs: <!-- homepage -->**[openpageflip.shittylittleapps.com](https://openpageflip.shittylittleapps.com)**<!-- /homepage --> (built from [`apps/docs`](apps/docs)).

Both packages are pre-1.0 and under active construction. [`SPEC.md`](SPEC.md) has the plan, the decisions behind it, and what is still open.

## Features

The page turn itself is StPageFlip's, right down to the fold geometry, and the test suite holds ours to the original pixel for pixel. Most of what's new comes straight out of the issues people filed on the original repos over the years.

| | StPageFlip / react-pageflip | OpenPageFlip |
| --- | :---: | :---: |
| Soft pages that curl, hard pages that swing stiff | ✓ | ✓ |
| Turn by drag, click or swipe | ✓ | ✓ |
| Shadows that move with the fold | ✓ | ✓ |
| Spread that drops to one page when narrow | ✓ | ✓ |
| Fixed size, or stretch to the container | ✓ | ✓ |
| Covers that stand alone | ✓ | ✓ |
| Pages are plain HTML | ✓ | ✓ |
| Swap pages in place | ✓ | ✓ |
| React component | ✓ | ✓ React 19 |
| Canvas mode for image books | ✓ | - (an `<img>` on each page) |
| Hover cue | Corner lifts | Whole edge furls, leaning toward the pointer |
| Click and drag only from the edge, so text selects and links click | - | ✓ |
| Right-to-left, top and bottom bindings | - | ✓ |
| One page at a time at any width (`layout: "single"`) | - | ✓ |
| `flipProgress` event on every frame | - | ✓ |
| Flip methods return a promise that resolves on landing | - | ✓ |
| React props and children change without a remount | - | ✓ |
| Safe to server-render | - | ✓ |
| Page around the book still scrolls on touch | Behind a flag | ✓ |
| Respects `prefers-reduced-motion` | - | ✓ |
| Works in a container scaled with CSS | - | ✓ |
| `destroy()` stops the loop and restores your DOM | - | ✓ |
| Nothing drawn while the book is idle | - | ✓ |
| Strict TypeScript types, every option optional | - | ✓ |

A handful of things behave differently from the original on purpose. [`SPEC.md`](SPEC.md) lists them with the reasons, and the migration guide on the docs site maps every old option and method to its new name.

## Working on it

Requires [Bun](https://bun.com) 1.4+ and [Task](https://taskfile.dev). `task --list` shows every command; `task install` then `task check` runs what CI runs. [`CONTRIBUTING.md`](CONTRIBUTING.md) has the rest.

## License

MIT. The page-fold geometry derives from Oleg Litovski's StPageFlip, also MIT.
