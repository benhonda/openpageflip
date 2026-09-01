import "@openpageflip/core/styles.css";
import { type Book, createBook } from "@openpageflip/core";

export function mount(container: HTMLElement): Book {
  return createBook(container, {
    width: 300,
    height: 420,
    layout: "single", // one page at a time, however wide the container is
    click: "corners", // only a click near a corner turns the page
    flipDuration: 600,
  });
}
