import "@openpageflip/core/styles.css";
import { FlipBook, Page } from "@openpageflip/react";
import { useRef } from "react";

const titles = ["Cover", "One", "Two", "Three", "Four", "The end"];
const last = titles.length - 1;

export default function HoverZoom() {
  const frame = useRef<HTMLDivElement>(null);
  // A mouse is over the book, and the book is at rest. Both, or there is no zoom.
  const now = useRef({ over: false, reading: true });
  // Straight to the style: the pointer moves far too often for React state.
  const zoom = (change: Partial<typeof now.current>) => {
    Object.assign(now.current, change);
    const on = now.current.over && now.current.reading;
    frame.current?.style.setProperty("--zoom", on ? "2" : "1");
    // Zooming in eases, unless the reader asked for less motion. Zooming out is instant, because
    // it happens as a page starts to move, and a turning page folds past the book's box: the
    // frame can only clip while the zoom is on.
    const ease = on && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    frame.current?.style.setProperty("--ease", ease ? "150ms" : "0s");
    frame.current?.style.setProperty("overflow", on ? "hidden" : "visible");
  };
  return (
    <div
      ref={frame}
      className="book"
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        // Scaling about the pointer leaves the spot under it where it was, so moving the mouse
        // pans, and the book's edges are still under the pointer where they were without a zoom.
        const box = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--x", `${e.clientX - box.left}px`);
        e.currentTarget.style.setProperty("--y", `${e.clientY - box.top}px`);
        zoom({ over: true });
      }}
      onPointerLeave={() => zoom({ over: false })}
    >
      <FlipBook
        width={400}
        height={560}
        size="stretch"
        cover
        style={{
          transform: "scale(var(--zoom, 1))",
          transformOrigin: "var(--x) var(--y)",
          transition: "transform var(--ease, 0s)",
        }}
        // A furled edge, a drag and a flip all leave "read", so the zoom steps back for each.
        onChangeState={(e) => zoom({ reading: e.state === "read" })}
      >
        {titles.map((title, i) => (
          <Page
            key={title}
            density={i === 0 || i === last ? "hard" : "soft"}
            className={i === 0 || i === last ? "page page-cover" : "page"}
          >
            <h3>{title}</h3>
            {i !== 0 && i !== last && (
              <p style={{ fontSize: "0.5rem" }}>
                The small print. Rest the mouse on it to read it, and move to the page's outer edge
                when you want to turn on.
              </p>
            )}
          </Page>
        ))}
      </FlipBook>
    </div>
  );
}
