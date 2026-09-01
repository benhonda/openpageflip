# @openpageflip/core

Framework-agnostic page-turn engine. Successor to [`page-flip`](https://www.npmjs.com/package/page-flip) (StPageFlip): the same look, pixel-matched against the original in the test suite, on modern internals.

Docs, live demos, the API reference and the changelog: **https://benhonda.github.io/openpageflip/**

```sh
bun add @openpageflip/core
```

The container's children are the pages. `data-density="hard"` makes a page rigid.

<!-- example: apps/docs/src/examples/core/pages.html -->
```html
<div id="book">
  <div class="page page-cover" data-density="hard">
    <h2>OpenPageFlip</h2>
    <p>A page-turn effect for the web</p>
  </div>
  <div class="page">
    <h3>Drag a corner</h3>
    <p>Pick up any corner and pull. Let go past the middle and the page turns. Let go early and it settles back.</p>
  </div>
  <div class="page">
    <h3>Or just click</h3>
    <p>A click on either half turns the page that way. On a touch screen, a swipe does the same.</p>
  </div>
  <div class="page">
    <h3>Hard and soft</h3>
    <p>Covers are hard: they swing as one rigid sheet. Inner pages bend along the fold, like paper.</p>
  </div>
  <div class="page">
    <h3>Any HTML</h3>
    <p>Pages are ordinary elements. Text, images, forms, video: whatever a page holds keeps working.</p>
  </div>
  <div class="page page-cover" data-density="hard">
    <p>The end</p>
  </div>
</div>
```
<!-- /example -->

<!-- example: apps/docs/src/examples/core/quickstart.ts -->
```ts
import "@openpageflip/core/styles.css";
import { type Book, createBook } from "@openpageflip/core";

/** The container's children are the pages, in reading order. */
export function mount(container: HTMLElement): Book {
  return createBook(container, {
    width: 400, // base page size; with size "stretch" only the ratio matters
    height: 560,
    size: "stretch", // scale to the container, portrait when it gets narrow
    cover: true, // first and last pages stand alone
  });
}
```
<!-- /example -->

The code above is the docs site's own example and runs in its test suite. Pre-1.0: the plan, decisions and status live in the repository's [SPEC.md](https://github.com/benhonda/openpageflip/blob/main/SPEC.md).
