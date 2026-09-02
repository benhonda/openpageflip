import "@openpageflip/core/styles.css";
import { type Book, createBook } from "@openpageflip/core";

export function mount(container: HTMLElement): Book {
  return createBook(container, {
    width: 360, // the page's ratio, and with maxWidth below, its largest size
    height: 480,
    size: "stretch", // shrinks to fit a phone
    maxWidth: 360, // but never grows past one phone-sized page
    layout: "single", // one page, however wide the container is
    click: "corners", // the middle of the page is left to whatever it holds
  });
}
