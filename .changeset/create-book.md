---
"@openpageflip/core": minor
---

`createBook(container, options)`: the headless controller, DOM renderer and pointer input. Drag, click, swipe and hover flips; soft and hard pages; portrait and landscape with `layout: "auto" | "single" | "spread"`; ResizeObserver-driven relayout; typed events; promises that resolve when a flip lands; `prefers-reduced-motion`; a `destroy()` that restores the DOM. Rendering is pixel-matched to page-flip 2.0.7 by a visual parity suite. Frames are drawn only on change, never on an idle timer.
