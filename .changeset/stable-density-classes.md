---
"@openpageflip/core": patch
---

`.opf-page--hard` and `.opf-page--soft` now say what a page is and stay put through a turn. A soft page on the back of a hard one (the page behind a cover) swings as a board while that sheet turns, and its class used to switch to `--hard` for the length of the turn, so anything you styled on `--soft` (a gutter shadow, a margin) blinked off as the cover moved, even on hover. How the page is drawn hasn't changed, only the class. For the state of a page right now there are `--flat` and `--turning`.
