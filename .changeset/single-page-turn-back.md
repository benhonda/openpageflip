---
"@openpageflip/core": minor
---

Turning back in a single-page book now looks like turning forward. The previous page uncurls across the page you're on, with the same curl and shadows at the same point in the turn, instead of sliding in flat from beside the book. The pointer holds the fold, and letting go past the middle of the page lands the turn. Hovering by the spine curls the first strip of it over, leaning toward the pointer like the edge furl. Nothing of a turn is drawn beside a single-page book any more, and a hard page there swings up to upright at the spine rather than over into the hidden half, so you can see it move for the whole turn. Its shadow there fades out from the cover's edge instead of sweeping across the page as a slab with a hard edge. Two-page books look exactly as before.

`FlipFrame.peek` is gone: that cue is now the start of an ordinary turn. In a single-page book a turn back's frames run forward (the previous page turning off itself), with that page on show as `right` and the current page as `bottom`; `flipProgress` still reports it as a turn back.
