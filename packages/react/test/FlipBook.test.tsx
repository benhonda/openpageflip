import "@openpageflip/core/styles.css";
import { type Book, FlipState } from "@openpageflip/core";
import { createRef, useState } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { configure } from "vitest-browser-react/pure";
import { FlipBook, Page } from "../src/index.ts";

configure({ reactStrictMode: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Stage({ width = 500, children }: { width?: number; children: React.ReactNode }) {
  return <div style={{ width }}>{children}</div>;
}

/** A component with no ref plumbing at all: the thing the old wrapper could not accept. */
function PlainPage({ label }: { label: string }) {
  return <p>{label}</p>;
}

afterEach(() => {
  document.body.style.margin = "";
});

describe("FlipBook", () => {
  test("children become pages, Page marks hard ones, and the ref is the Book", async () => {
    const book = createRef<Book>();
    const screen = await render(
      <Stage>
        <FlipBook ref={book} width={250} height={350} cover>
          <Page density="hard" className="cover">
            Cover
          </Page>
          <PlainPage label="One" />
          <PlainPage label="Two" />
          <Page>Three</Page>
        </FlipBook>
      </Stage>,
    );
    expect(book.current).not.toBeNull();
    expect(book.current?.pageCount).toBe(4);
    expect(book.current?.page).toBe(0);
    expect(book.current?.orientation).toBe("landscape");
    const cover = screen.container.querySelector(".cover");
    expect(cover?.getAttribute("data-density")).toBe("hard");
    expect(cover?.classList.contains("opf-page--hard")).toBe(true);
    await expect.element(screen.getByText("One")).toBeInTheDocument();
    expect(screen.container.querySelectorAll("[data-opf-page]")).toHaveLength(4);
  });

  test("the controlled page prop flips the book, and onFlip reports where it landed", async () => {
    const flips: number[] = [];
    function Controlled() {
      const [page, setPage] = useState(0);
      return (
        <Stage>
          <button type="button" onClick={() => setPage(3)}>
            go
          </button>
          <FlipBook
            width={250}
            height={350}
            flipDuration={40}
            page={page}
            onFlip={(e) => {
              flips.push(e.page);
              setPage(e.page);
            }}
          >
            {["a", "b", "c", "d", "e", "f"].map((label) => (
              <Page key={label}>{label}</Page>
            ))}
          </FlipBook>
        </Stage>
      );
    }
    const screen = await render(<Controlled />);
    await screen.getByRole("button", { name: "go" }).click();
    await sleep(300);
    // Page 3 lives on spread [2, 3]; the book reports a spread by its first page.
    expect(flips).toEqual([2]);
  });

  test("adding a page adopts it into the same book without remounting", async () => {
    const book = createRef<Book>();
    function Growing() {
      const [count, setCount] = useState(2);
      return (
        <Stage>
          <button type="button" onClick={() => setCount(4)}>
            more
          </button>
          <FlipBook ref={book} width={250} height={350}>
            {Array.from({ length: count }, (_, i) => `p${i}`).map((label) => (
              <Page key={label}>{label}</Page>
            ))}
          </FlipBook>
        </Stage>
      );
    }
    const screen = await render(<Growing />);
    const before = book.current;
    const updates: number[] = [];
    before?.on("update", (e) => updates.push(e.page));
    expect(before?.pageCount).toBe(2);
    await screen.getByRole("button", { name: "more" }).click();
    expect(book.current).toBe(before);
    expect(before?.pageCount).toBe(4);
    expect(updates).toEqual([0]);
  });

  test("changing a setting rebuilds the book on the same page", async () => {
    const book = createRef<Book>();
    function Resizable() {
      const [width, setWidth] = useState(250);
      return (
        <Stage width={600}>
          <button type="button" onClick={() => setWidth(300)}>
            wider
          </button>
          <FlipBook ref={book} width={width} height={350} startPage={2}>
            {["a", "b", "c", "d"].map((label) => (
              <Page key={label}>{label}</Page>
            ))}
          </FlipBook>
        </Stage>
      );
    }
    const screen = await render(<Resizable />);
    expect(book.current?.rect.pageWidth).toBe(250);
    expect(book.current?.page).toBe(2);
    await screen.getByRole("button", { name: "wider" }).click();
    expect(book.current?.rect.pageWidth).toBe(300);
    expect(book.current?.page).toBe(2);
  });

  test("a changed className on a Page keeps the book's own classes", async () => {
    function Renamed() {
      const [name, setName] = useState("first");
      return (
        <Stage>
          <button type="button" onClick={() => setName("second")}>
            rename
          </button>
          <FlipBook width={250} height={350}>
            <Page className={name}>a</Page>
            <Page>b</Page>
          </FlipBook>
        </Stage>
      );
    }
    const screen = await render(<Renamed />);
    const first = screen.container.querySelector<HTMLElement>(".first");
    expect(first?.classList.contains("opf-page")).toBe(true);
    await screen.getByRole("button", { name: "rename" }).click();
    expect(first?.classList.contains("second")).toBe(true);
    expect(first?.classList.contains("opf-page")).toBe(true);
    expect(first?.classList.contains("opf-page--left")).toBe(true);
  });

  test("a page's own inline style and class survive a flip", async () => {
    const book = createRef<Book>();
    const screen = await render(
      <Stage>
        <FlipBook ref={book} width={250} height={350} flipDuration={40}>
          <Page className="first" style={{ background: "pink" }}>
            a
          </Page>
          <Page>b</Page>
          <Page>c</Page>
          <Page>d</Page>
        </FlipBook>
      </Stage>,
    );
    const first = screen.container.querySelector<HTMLElement>(".first");
    await book.current?.flipNext();
    expect(book.current?.page).toBe(2);
    expect(first?.style.background).toBe("pink");
    expect(first?.classList.contains("opf-page")).toBe(true);
    expect(first?.classList.contains("first")).toBe(true);
  });

  test("unmounting restores the DOM and the handle says it is gone", async () => {
    const book = createRef<Book>();
    const screen = await render(
      <Stage>
        <FlipBook ref={book} width={250} height={350}>
          <Page>a</Page>
          <Page>b</Page>
        </FlipBook>
      </Stage>,
    );
    const container =
      screen.container.querySelector<HTMLElement>("[data-opf-page]")?.parentElement ?? null;
    expect(container?.classList.contains("opf-book")).toBe(true);
    expect(book.current?.state).toBe(FlipState.read);
    const handle = book.current;
    await screen.unmount();
    // The core restored the element it was given, and the handle knows the book is gone.
    expect(container?.classList.contains("opf-book")).toBe(false);
    expect(container?.querySelector(".opf-shadow")).toBeNull();
    expect(() => handle?.page).toThrow(/not mounted/);
  });
});
