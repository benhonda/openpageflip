# @openpageflip/react

## 0.1.1

### Patch Changes

- [`9a70bd3`](https://github.com/benhonda/openpageflip/commit/9a70bd310a03d6d455f3b42ecc595e221af21f85) Thanks [@benhonda](https://github.com/benhonda)! - Audit fixes. Core: `flipTo` during a running flip lands it first instead of overshooting; a press during a flip lands it; `drag: false` no longer turns a long drag into a click; `ignoreDragOn` is validated at `createBook` and accepts `false`; a resize mid-drag drops the stale fold; `turnTo` out of range throws; a frame timestamp before the tween's start no longer produces negative progress; the renderer re-asserts its classes on every draw and writes to idle pages once, not every frame; an already-aborted `AbortSignal` never subscribes; `Book.redraw()` added. The unimplemented `Direction` vocabulary is removed until right-to-left lands. React: `FlipBook` redraws instead of re-measuring after each commit, and the ref handle exposes `redraw`.

- [`ce0f54d`](https://github.com/benhonda/openpageflip/commit/ce0f54db0e035f468e24b8316f19dcd0c2f3e63e) Thanks [@benhonda](https://github.com/benhonda)! - Docs site at https://benhonda.github.io/openpageflip/ with live demos and a generated API reference. READMEs now point there and embed their quick start from the site's own examples, which run in the test suite. Types the public API already referred to are exported so the reference (and your editor) can name them: `ShadowData`, `FlipFrame`, `Emitter`, `Listener`, `LayoutOptions`, `LayoutResult`, `ResolvedOptions` from core and `FlipBookEventProps` from react.
- Updated dependencies [[`9a70bd3`](https://github.com/benhonda/openpageflip/commit/9a70bd310a03d6d455f3b42ecc595e221af21f85), [`ce0f54d`](https://github.com/benhonda/openpageflip/commit/ce0f54db0e035f468e24b8316f19dcd0c2f3e63e)]:
  - @openpageflip/core@0.2.0

## 0.1.0

### Minor Changes

- [`f0701b8`](https://github.com/benhonda/openpageflip/commit/f0701b8d0852e4479817a8e445ba5f1ed3765870) Thanks [@benhonda](https://github.com/benhonda)! - `FlipBook` and `Page`: React 19 bindings with `ref` as a prop (the core `Book`), a controlled `page` prop, event props typed from the core, reactive options, children that can change without a remount, StrictMode-safe mount and unmount, and server rendering.

### Patch Changes

- Updated dependencies [[`e183337`](https://github.com/benhonda/openpageflip/commit/e183337f9e65ea1e42be03e6013613b895029e8b), [`e8c83d9`](https://github.com/benhonda/openpageflip/commit/e8c83d96c1607bbcfe2d6e5aa601438be0c9eb9a), [`20ffe9f`](https://github.com/benhonda/openpageflip/commit/20ffe9fa2336f43f973c1b71b023dfb6591bf839)]:
  - @openpageflip/core@0.1.0

## 0.0.1

### Patch Changes

- [`0074b5e`](https://github.com/benhonda/openpageflip/commit/0074b5e19a2c5dd29b651d3645c4263d3cae9cfb) Thanks [@benhonda](https://github.com/benhonda)! - First pre-release shells: package layout, option vocabularies and the stylesheet entry. Proves the build and publish pipeline; no page-flip behaviour yet.
- Updated dependencies [[`0074b5e`](https://github.com/benhonda/openpageflip/commit/0074b5e19a2c5dd29b651d3645c4263d3cae9cfb)]:
  - @openpageflip/core@0.0.1
