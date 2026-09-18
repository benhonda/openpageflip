---
"@openpageflip/core": patch
---

A book you've scaled still finds its edges. With a `transform: scale()` or a CSS `zoom` on the book or anything around it, presses and hovers used to land somewhere else on the page (at 2x, twice as far from the corner), so the edges wouldn't furl or drag. The pointer is now brought back into the book's own pixels first, for an even or an uneven scale. A border on the book's container is accounted for too, where a press used to land off by the border's width. Rotation and skew still aren't undone. The new hover zoom example in the docs is built on this.
