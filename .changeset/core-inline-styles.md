---
"@openpageflip/core": patch
---

Pages keep their own inline styles: the renderer now writes only the properties it owns instead of replacing `style` wholesale. `flip` fires only when the shown spread changes, so redraws and relayouts stay quiet.
