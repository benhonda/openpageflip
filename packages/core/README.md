# @openpageflip/core

Framework-agnostic page-turn engine. Successor to [`page-flip`](https://www.npmjs.com/package/page-flip) (StPageFlip): the same look, pixel-matched against the original in the test suite, on modern internals.

Pre-1.0. The plan, decisions and status live in the [repository's SPEC.md](https://github.com/benhonda/openpageflip/blob/main/SPEC.md).

```sh
bun add @openpageflip/core
```

```html
<div id="book">
  <div data-density="hard">Cover</div>
  <div>Page 1</div>
  <div>Page 2</div>
  <div data-density="hard">Back cover</div>
</div>
```

```ts
import "@openpageflip/core/styles.css";
import { createBook } from "@openpageflip/core";

const book = createBook(document.getElementById("book"), {
  width: 400, // base page size; with size: "stretch" only the ratio matters
  height: 600,
  size: "stretch",
  layout: "auto", // "single" | "spread" | "auto" (by container width)
  cover: true,
});

book.on("flip", ({ page }) => console.log("now on page", page));
await book.flipNext(); // resolves when the turn lands
book.destroy(); // restores the DOM
```

Pages are the container's children (or `options.pages`). Add `data-density="hard"` for rigid pages. Pointer events start on links, buttons and form fields, or anything matching `ignoreDragOn`, are left alone.

A CDN build is published as `dist/index.iife.js` and exposes `window.OpenPageFlip`.
