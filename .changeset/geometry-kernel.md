---
"@openpageflip/core": minor
---

Geometry kernel: `computeFold` turns a dragged corner into the page rotation, clip polygons and shadow line, as a pure function with the same output as StPageFlip's original maths (held to it by live parity tests). Numbers instead of strings for page size, a `null` result instead of thrown errors for degenerate drags, no `null` entries inside polygons.
