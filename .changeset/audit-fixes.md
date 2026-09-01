---
"@openpageflip/core": minor
"@openpageflip/react": patch
---

Audit fixes. Core: `flipTo` during a running flip lands it first instead of overshooting; a press during a flip lands it; `drag: false` no longer turns a long drag into a click; `ignoreDragOn` is validated at `createBook` and accepts `false`; a resize mid-drag drops the stale fold; `turnTo` out of range throws; a frame timestamp before the tween's start no longer produces negative progress; the renderer re-asserts its classes on every draw and writes to idle pages once, not every frame; an already-aborted `AbortSignal` never subscribes; `Book.redraw()` added. The unimplemented `Direction` vocabulary is removed until right-to-left lands. React: `FlipBook` redraws instead of re-measuring after each commit, and the ref handle exposes `redraw`.
