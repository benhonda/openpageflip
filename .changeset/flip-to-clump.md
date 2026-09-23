---
"@openpageflip/core": minor
---

`flipTo` now looks like you're turning a clump of pages when it jumps more than one spread. The page on show still turns straight onto your target, but a few blank sheets (one per spread you skip, up to five) fan out from under it, curling at the corner, and close back up before it lands. They take their colour from your inner pages, not the cover, and you can set it with `--opf-sheet-color`. A cover closing over them brings blank pages along behind it. Nothing between the two spreads is drawn, and it's still one turn to you: one `flip` event and one `flipProgress` from 0 to 1.

For custom renderers, each `FlipFrame` has a new `sheets` list describing those blank sheets (empty for an ordinary turn).

Also fixed: resizing the book or giving it new pages in the middle of a turn used to drop the turn but leave the book reporting `flipping`, so it ignored hover and clicks until the next one. It's back at rest now.
