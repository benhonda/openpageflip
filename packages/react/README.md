# @openpageflip/react

React 19 bindings for [`@openpageflip/core`](https://www.npmjs.com/package/@openpageflip/core). Successor to [`react-pageflip`](https://www.npmjs.com/package/react-pageflip).

Pre-1.0. The plan, decisions and status live in the [repository's SPEC.md](https://github.com/benhonda/openpageflip/blob/main/SPEC.md).

```sh
bun add @openpageflip/core @openpageflip/react
```

```tsx
import "@openpageflip/core/styles.css";
import { FlipBook, Page, type Book } from "@openpageflip/react";
import { useRef } from "react";

export function Album() {
  const book = useRef<Book>(null);
  return (
    <>
      <button onClick={() => book.current?.flipNext()}>Next</button>
      <FlipBook ref={book} width={400} height={600} size="stretch" cover onFlip={(e) => console.log(e.page)}>
        <Page density="hard">Cover</Page>
        <Page>One</Page>
        <Photo src="two.jpg" /> {/* any child is a page; no refs needed */}
        <Page density="hard">Back</Page>
      </FlipBook>
    </>
  );
}
```

- Every direct child is a page. Use `Page` to mark hard pages or to put a class or style on the page element itself.
- `ref` gives you the core `Book` (`flipNext`, `flipTo`, `page`, `on`, ...).
- `page` makes the book controlled: change it and the book flips there. `onFlip` reports the first page of the spread that landed.
- Options are props. Changing one rebuilds the book on the same page. Children can change freely.
- Requires React 19. The component is a client component and ships with `"use client"`; it renders on the server.
