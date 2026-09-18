---
"@openpageflip/core": minor
---

A book looks right out of the box on white paper. `shadowOpacity` now defaults to `0.35` instead of `1`, which was a black bar across light pages, and the page in the air has a hairline edge, so a white page turning over a white page keeps its outline where no shadow falls. The edge is the new `.opf-page--turning` class in `styles.css`: recolour it with the `--opf-page-edge` CSS variable, or set that to `transparent` to remove it. For the look of earlier versions, pass `shadowOpacity: 1` and set `--opf-page-edge: transparent`.
