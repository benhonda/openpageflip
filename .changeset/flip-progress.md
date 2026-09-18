---
"@openpageflip/core": minor
"@openpageflip/react": minor
---

A `flipProgress` event (`onFlipProgress` in React), for keeping something of your own in step with a turning page, like a shadow under a book whose cover is closing. It fires for every frame the book draws of a turn, whether that turn is animated, dragged, or a hovered edge furling, with the spread it started `from`, the spread it leads `to`, the `direction`, and a `progress` from 0 to 1. A turn always ends on exactly 0 (dropped back, or cut short by a resize, another turn, or `destroy`) or 1 (landed), so a listener never has to guess the destination or copy the book's timing. `from` is the spread on show, which for `flipTo` is the one the reader sees and not the one the book jumped beside. It runs every frame, so write it to a style, not to state; the new shadow example in the docs does exactly that.

A hard page's shadow no longer lands on the bare stage when the cover closes, or when the book turns onto its lone last page. It was already skipped on the empty side a cover opens onto; now the side a cover lifts away from gets the same check. For anyone reading frames: `FlipFrame.bottom` is now `null` when a turn reveals nothing, where it used to repeat the flipping page.
