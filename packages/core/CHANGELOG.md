# @openpageflip/core

## 0.1.0

### Minor Changes

- [`e8c83d9`](https://github.com/benhonda/openpageflip/commit/e8c83d96c1607bbcfe2d6e5aa601438be0c9eb9a) Thanks [@benhonda](https://github.com/benhonda)! - `createBook(container, options)`: the headless controller, DOM renderer and pointer input. Drag, click, swipe and hover flips; soft and hard pages; portrait and landscape with `layout: "auto" | "single" | "spread"`; ResizeObserver-driven relayout; typed events; promises that resolve when a flip lands; `prefers-reduced-motion`; a `destroy()` that restores the DOM. Rendering is pixel-matched to page-flip 2.0.7 by a visual parity suite. Frames are drawn only on change, never on an idle timer.

- [`20ffe9f`](https://github.com/benhonda/openpageflip/commit/20ffe9fa2336f43f973c1b71b023dfb6591bf839) Thanks [@benhonda](https://github.com/benhonda)! - Geometry kernel: `computeFold` turns a dragged corner into the page rotation, clip polygons and shadow line, as a pure function with the same output as StPageFlip's original maths (held to it by live parity tests). Numbers instead of strings for page size, a `null` result instead of thrown errors for degenerate drags, no `null` entries inside polygons.

### Patch Changes

- [`e183337`](https://github.com/benhonda/openpageflip/commit/e183337f9e65ea1e42be03e6013613b895029e8b) Thanks [@benhonda](https://github.com/benhonda)! - Pages keep their own inline styles: the renderer now writes only the properties it owns instead of replacing `style` wholesale. `flip` fires only when the shown spread changes, so redraws and relayouts stay quiet.

## 0.0.1

### Patch Changes

- [`0074b5e`](https://github.com/benhonda/openpageflip/commit/0074b5e19a2c5dd29b651d3645c4263d3cae9cfb) Thanks [@benhonda](https://github.com/benhonda)! - First pre-release shells: package layout, option vocabularies and the stylesheet entry. Proves the build and publish pipeline; no page-flip behaviour yet.
