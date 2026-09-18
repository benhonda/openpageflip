# @openpageflip/core

## 0.4.2

### Patch Changes

- [`d65839e`](https://github.com/benhonda/openpageflip/commit/d65839e8b8c54cca686acac7ac4b6edae0201f96) Thanks [@benhonda](https://github.com/benhonda)! - The previous page peeking in over the spine of a single-page book now drops a shadow on the page under it, so it reads as paper and not a flat bar. The fold's own shadows hug its crease, which for a peek is half a page away in the hidden half, so none of them reached the strip. It follows `shadows` and `shadowOpacity`, and a turn in hand is drawn as before.

## 0.4.1

### Patch Changes

- [`a0fe481`](https://github.com/benhonda/openpageflip/commit/a0fe4811d9add3b3991b57fb384801a03fd997fc) Thanks [@benhonda](https://github.com/benhonda)! - `@openpageflip/core` and `@openpageflip/react` now share one version number and always release together, so matching versions are the ones built and tested against each other. No code changed in this release; react jumps from 0.2.0 to meet core.

## 0.4.0

### Minor Changes

- [`8669c10`](https://github.com/benhonda/openpageflip/commit/8669c10759936165688384538fc834d8abfd49c2) Thanks [@benhonda](https://github.com/benhonda)! - Four bindings, and an edge that furls. `binding: "right"` is a right-to-left book: the spine on the right, the cover alone on the left, a swipe to the right reads on, and your pages stay in reading order. `binding: "top"` binds along the top edge, so pages lift from the bottom and turn up: a notepad with `layout: "single"`, a wall calendar with a spread. `"bottom"` is that upside down. Each is the left-bound book seen from another side; the fold geometry and the controller never see the binding, layout, pointer input and the renderer map at their edges, and a test holds each bound book to its left-bound twin pixel for pixel. The container gets `opf-book--<binding>`, top- and bottom-bound ones `touch-action: pan-x` from the stylesheet, and pages get `opf-page--top` and `--bottom` when they are stacked. `layout: "auto"` now reads "a spread when two pages fit across the spine", which for a left-bound book is what it was; a top- or bottom-bound book that sizes itself is always two pages tall, so it is a spread unless `layout` says `single`. Switching binding at a breakpoint is the host's call, and the docs show it with a media query.
  
  Hovering a page's edge now furls the whole edge, the same cue on every binding, instead of lifting the nearer corner; the option is `hover` (was `hoverCorners`). A drag moves the fold by the pointer's travel from where it took hold, so pulling straight in from anywhere on the edge deepens the furl and pulling from a corner folds across, and a press on a furled edge carries on from it. A click on a furled edge flips on from the furl.

- [`d43999c`](https://github.com/benhonda/openpageflip/commit/d43999cfd04135a494da8448850bf0e7e56f78aa) Thanks [@benhonda](https://github.com/benhonda)! - A `flipProgress` event (`onFlipProgress` in React), for keeping something of your own in step with a turning page, like a shadow under a book whose cover is closing. It fires for every frame the book draws of a turn, whether that turn is animated, dragged, or a hovered edge furling, with the spread it started `from`, the spread it leads `to`, the `direction`, and a `progress` from 0 to 1. A turn always ends on exactly 0 (dropped back, or cut short by a resize, another turn, or `destroy`) or 1 (landed), so a listener never has to guess the destination or copy the book's timing. `from` is the spread on show, which for `flipTo` is the one the reader sees and not the one the book jumped beside. It runs every frame, so write it to a style, not to state; the new shadow example in the docs does exactly that.
  
  A hard page's shadow no longer lands on the bare stage when the cover closes, or when the book turns onto its lone last page. It was already skipped on the empty side a cover opens onto; now the side a cover lifts away from gets the same check. For anyone reading frames: `FlipFrame.bottom` is now `null` when a turn reveals nothing, where it used to repeat the flipping page.

### Patch Changes

- [`8692021`](https://github.com/benhonda/openpageflip/commit/86920216fba720c1b6f109135734a946fd8ecff8) Thanks [@benhonda](https://github.com/benhonda)! - Two things for a single-page book. The edge by the spine, the one that turns back, now shows its cue: the page it turns lies in the hidden half, where a furl of its far edge showed nothing, so the previous page peeks in over the spine instead, a strip under the pointer. Let go of, a peek always goes back, however far past the spine the geometry says it is; a press takes it in hand as an ordinary turn that carries on from it. And a hard cover no longer vanishes when its edge is hovered, clicked or dragged: it was drawn twice, the second time as the far face of a spread's sheet, face down. It lifts and swings open as it does in the original, held to it by a new parity scenario.

- [`453b3b6`](https://github.com/benhonda/openpageflip/commit/453b3b6a84ec1b64d190609b6385c29c022f7a4f) Thanks [@benhonda](https://github.com/benhonda)! - A book you've scaled still finds its edges. With a `transform: scale()` or a CSS `zoom` on the book or anything around it, presses and hovers used to land somewhere else on the page (at 2x, twice as far from the corner), so the edges wouldn't furl or drag. The pointer is now brought back into the book's own pixels first, for an even or an uneven scale. A border on the book's container is accounted for too, where a press used to land off by the border's width. Rotation and skew still aren't undone. The new hover zoom example in the docs is built on this.

## 0.3.0

### Minor Changes

- [`9056442`](https://github.com/benhonda/openpageflip/commit/9056442df8c1d90cfcb47a9c53e67df11e5084ed) Thanks [@benhonda](https://github.com/benhonda)! - Hover, click and drag now act on the same part of a page, and by default that part is the outer edge. Before, a corner lifted when the mouse came near it, but a click or a drag anywhere on the page turned it too, so the lifted corner promised something it didn't mean. `click: "edges"` is the new default: the strip along each page's outer edge is where a corner lifts, a click turns and a drag starts. `"corners"` is gone; `"anywhere"` is still there for tap-anywhere books, and its hover cue now covers the whole page to match. Along the edge the nearer corner lifts and stays lifted until the pointer leaves the edge or reaches the other corner, instead of flapping at the midline. The middle of a page is the browser's again: text selects, and the stylesheet no longer sets `user-select: none`. A swipe is a touch or pen gesture now; a quick mouse drag is a selection or a corner drag, not a page turn. In portrait, the edge by the spine turns back, which the old corner boxes never reached.

## 0.2.4

### Patch Changes

- [`79d7c99`](https://github.com/benhonda/openpageflip/commit/79d7c9926dba1e3493a689c55c700a4d244a973a) Thanks [@benhonda](https://github.com/benhonda)! - The quick-start pages embedded in the READMEs read a little more like a person wrote them. No code changes.

## 0.2.3

### Patch Changes

- [`0911652`](https://github.com/benhonda/openpageflip/commit/09116529e5f070a7ee6a5b36a975f1d285e3b449) Thanks [@benhonda](https://github.com/benhonda)! - READMEs and the packages' `homepage` point at the docs site's real address, https://openpageflip.shittylittleapps.com, instead of a GitHub Pages URL that never went live.

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
