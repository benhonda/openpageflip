import "@openpageflip/core/styles.css";
import { type Book, createBook } from "@openpageflip/core";

/** A right-to-left book, the way a manga reads: the spine on the right, the cover on the left. */
export function mount(container: HTMLElement): Book {
  return createBook(container, {
    width: 400,
    height: 560,
    size: "stretch",
    cover: true,
    binding: "right", // pages turn from the left edge; a swipe to the right reads on
  });
}
