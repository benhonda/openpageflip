# @openpageflip/core

## 0.2.2

### Patch Changes

- [`9a1ad82`](https://github.com/benhonda/openpageflip/commit/9a1ad82badec9e94c2d3495b7f79838631cfe497) Thanks [@benhonda](https://github.com/benhonda)! - A hovered corner lifts and drops over at least a quarter of `flipDuration` instead of snapping, and the same floor applies to every short animation path, such as a corner released close to where it started. While a corner is hovered the pointer takes over from the lift animation instead of fighting it. A settling corner is no longer restarted by every further mouse move, which made it stutter and only land once the mouse stopped, and a pointer jumping to another corner lets the lifted one settle instead of folding it from the wrong corner.

## 0.2.1

### Patch Changes

- [`329cb63`](https://github.com/benhonda/openpageflip/commit/329cb636aac5af1c4a9ec5f78f37e281bb48d4ac) Thanks [@benhonda](https://github.com/benhonda)! - A hard page's shadow is no longer painted on the empty side of the stage when a cover opens or the lone last page closes. It is drawn only where a page is there to receive it.

## 0.2.0

### Minor Changes

- [`9a70bd3`](https://github.com/benhonda/openpageflip/commit/9a70bd310a03d6d455f3b42ecc595e221af21f85) Thanks [@benhonda](https://github.com/benhonda)! - Audit fixes. Core: `flipTo` during a running flip lands it first instead of overshooting; a press during a flip lands it; `drag: false` no longer turns a long drag into a click; `ignoreDragOn` is validated at `createBook` and accepts `false`; a resize mid-drag drops the stale fold; `turnTo` out of range throws; a frame timestamp before the tween's start no longer produces negative progress; the renderer re-asserts its classes on every draw and writes to idle pages once, not every frame; an already-aborted `AbortSignal` never subscribes; `Book.redraw()` added. The unimplemented `Direction` vocabulary is removed until right-to-left lands. React: `FlipBook` redraws instead of re-measuring after each commit, and the ref handle exposes `redraw`.

### Patch Changes

- [`ce0f54d`](https://github.com/benhonda/openpageflip/commit/ce0f54db0e035f468e24b8316f19dcd0c2f3e63e) Thanks [@benhonda](https://github.com/benhonda)! - Docs site at https://benhonda.github.io/openpageflip/ with live demos and a generated API reference. READMEs now point there and embed their quick start from the site's own examples, which run in the test suite. Types the public API already referred to are exported so the reference (and your editor) can name them: `ShadowData`, `FlipFrame`, `Emitter`, `Listener`, `LayoutOptions`, `LayoutResult`, `ResolvedOptions` from core and `FlipBookEventProps` from react.

## 0.1.0

### Minor Changes

- [`e8c83d9`](https://github.com/benhonda/openpageflip/commit/e8c83d96c1607bbcfe2d6e5aa601438be0c9eb9a) Thanks [@benhonda](https://github.com/benhonda)! - `createBook(container, options)`: the headless controller, DOM renderer and pointer input. Drag, click, swipe and hover flips; soft and hard pages; portrait and landscape with `layout: "auto" | "single" | "spread"`; ResizeObserver-driven relayout; typed events; promises that resolve when a flip lands; `prefers-reduced-motion`; a `destroy()` that restores the DOM. Rendering is pixel-matched to page-flip 2.0.7 by a visual parity suite. Frames are drawn only on change, never on an idle timer.

- [`20ffe9f`](https://github.com/benhonda/openpageflip/commit/20ffe9fa2336f43f973c1b71b023dfb6591bf839) Thanks [@benhonda](https://github.com/benhonda)! - Geometry kernel: `computeFold` turns a dragged corner into the page rotation, clip polygons and shadow line, as a pure function with the same output as StPageFlip's original maths (held to it by live parity tests). Numbers instead of strings for page size, a `null` result instead of thrown errors for degenerate drags, no `null` entries inside polygons.

### Patch Changes

- [`e183337`](https://github.com/benhonda/openpageflip/commit/e183337f9e65ea1e42be03e6013613b895029e8b) Thanks [@benhonda](https://github.com/benhonda)! - Pages keep their own inline styles: the renderer now writes only the properties it owns instead of replacing `style` wholesale. `flip` fires only when the shown spread changes, so redraws and relayouts stay quiet.

## 0.0.1

### Patch Changes

- [`0074b5e`](https://github.com/benhonda/openpageflip/commit/0074b5e19a2c5dd29b651d3645c4263d3cae9cfb) Thanks [@benhonda](https://github.com/benhonda)! - First pre-release shells: package layout, option vocabularies and the stylesheet entry. Proves the build and publish pipeline; no page-flip behaviour yet.
