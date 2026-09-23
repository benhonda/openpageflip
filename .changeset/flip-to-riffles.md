---
"@openpageflip/core": minor
---

`flipTo` now riffles through the pages in between instead of cutting to the page next to your target and turning just the last one. Up to five leaves turn, each lifting as the one above it gets about halfway over, and on a long jump they show pages sampled evenly along the way, so a jump of two spreads and a jump of two hundred take about the same time. It still counts as one turn: `flipProgress` goes from 0 to 1 once for the whole jump and `flip` fires once, when it lands. Single turns look exactly as before.

For custom renderers: `Frame.flip` is now `Frame.leaves`, a list of the leaves in the air with the top one first, and each `FlipFrame` has a `front` (the page it lifts from, drawn where it still lies flat, `Fold.flatClip`). `Frame.left` and `Frame.right` are the pages lying flat under all of them, so on the side a turn lifts from that's the page it reveals.

Also fixed: resizing the book, or giving it new pages, in the middle of a turn used to drop the turn but leave the book reporting `flipping`, so it ignored hover and clicks until the next turn. It's back at rest now.
