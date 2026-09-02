# @openpageflip/react

React 19 bindings for [`@openpageflip/core`](https://www.npmjs.com/package/@openpageflip/core). Successor to [`react-pageflip`](https://www.npmjs.com/package/react-pageflip).

Docs, live demos, the API reference and the changelog: <!-- homepage -->**[openpageflip.shittylittleapps.com](https://openpageflip.shittylittleapps.com)**<!-- /homepage -->

```sh
bun add @openpageflip/core @openpageflip/react
```

Every direct child of `FlipBook` is a page. `Page` marks the hard ones and styles the page element itself. `ref` is the core `Book`.

<!-- example: apps/docs/src/examples/react/Quickstart.tsx -->
```tsx
import "@openpageflip/core/styles.css";
import { type Book, FlipBook, Page } from "@openpageflip/react";
import { useRef } from "react";

export default function Quickstart() {
  const book = useRef<Book>(null);
  return (
    <>
      <FlipBook ref={book} className="book" width={400} height={560} size="stretch" cover>
        <Page density="hard" className="page page-cover">
          <h2>OpenPageFlip</h2>
          <p>A page-turn effect for React</p>
        </Page>
        <Page className="page">
          <h3>Every child is a page</h3>
          <p>
            Wrap one in Page to make it hard, or to put a class or style on the page element itself.
          </p>
        </Page>
        <Page className="page">
          <h3>No refs on pages</h3>
          <p>The book owns the page elements. Your components render inside them.</p>
        </Page>
        <Page className="page">
          <h3>Props are options</h3>
          <p>Change one and the book is rebuilt on the same page. Children can change whenever.</p>
        </Page>
        <Page className="page">
          <h3>Renders on the server</h3>
          <p>This page was server-rendered by the docs site and hydrated after.</p>
        </Page>
        <Page density="hard" className="page page-cover">
          <p>The end</p>
        </Page>
      </FlipBook>
      <p className="controls">
        <button type="button" onClick={() => book.current?.flipPrev()}>
          Previous
        </button>
        <button type="button" onClick={() => book.current?.flipNext()}>
          Next
        </button>
      </p>
    </>
  );
}
```
<!-- /example -->

The code above is the docs site's own example and runs in its test suite. Pre-1.0: the plan, decisions and status live in the repository's [SPEC.md](https://github.com/benhonda/openpageflip/blob/main/SPEC.md).
