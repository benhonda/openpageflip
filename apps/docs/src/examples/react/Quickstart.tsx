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
