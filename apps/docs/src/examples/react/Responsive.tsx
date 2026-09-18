import "@openpageflip/core/styles.css";
import { FlipBook, Page } from "@openpageflip/react";
import { useSyncExternalStore } from "react";

/** Whether a media query matches, kept current. False on the server, where there is no viewport. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

const pages = ["Cover", "One", "Two", "Three", "Four", "The end"];

export default function Responsive() {
  // The breakpoint is yours: the book only knows which way it is bound. Below it, the spread
  // becomes a notepad. Changing a prop rebuilds the book on the page it was showing.
  const handheld = useMediaQuery("(max-width: 640px)");
  return (
    <FlipBook
      className="book"
      width={360}
      height={480}
      size="stretch"
      maxWidth={360}
      cover
      binding={handheld ? "top" : "left"}
      layout={handheld ? "single" : "auto"}
    >
      {pages.map((title, i) => {
        const isCover = i === 0 || i === pages.length - 1;
        return (
          <Page
            key={title}
            density={isCover ? "hard" : "soft"}
            className={isCover ? "page page-cover" : "page"}
          >
            <h3>{title}</h3>
            {!isCover && (
              <p>
                {handheld
                  ? "A notepad: pull the bottom edge up."
                  : "A book: pull the outer edge across. Make the window narrower than 640px and it becomes a notepad."}
              </p>
            )}
          </Page>
        );
      })}
    </FlipBook>
  );
}
