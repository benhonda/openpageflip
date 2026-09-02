---
"@openpageflip/core": patch
---

A hovered corner lifts and drops over at least a quarter of `flipDuration` instead of snapping, and the same floor applies to every short animation path, such as a corner released close to where it started. While a corner is hovered the pointer takes over from the lift animation instead of fighting it. A settling corner is no longer restarted by every further mouse move, which made it stutter and only land once the mouse stopped, and a pointer jumping to another corner lets the lifted one settle instead of folding it from the wrong corner.
