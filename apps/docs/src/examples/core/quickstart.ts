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
