import "@openpageflip/core/styles.css";
import { type Book, createBook } from "@openpageflip/core";

/** A notepad: bound along the top, one page, turned up from the bottom edge. */
export function mount(container: HTMLElement): Book {
  return createBook(container, {
    width: 360, // the page's ratio, and with maxWidth below, its largest size
    height: 480,
    size: "stretch", // shrinks to fit a phone
    maxWidth: 360, // but never grows past one phone-sized page
    binding: "top", // the spine runs along the top edge, so pages turn up
    layout: "single", // one page; "auto" would stack two, like a wall calendar
  });
}
