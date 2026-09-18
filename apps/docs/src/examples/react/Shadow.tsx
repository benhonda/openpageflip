import "@openpageflip/core/styles.css";
import { FlipBook, Page } from "@openpageflip/react";
import { useRef } from "react";

const titles = ["Cover", "One", "Two", "Three", "Four", "The end"];
const last = titles.length - 1;

/** How much of each half of the table the book covers at rest: closed, it only covers one. */
const resting = (page: number) => ({ left: page === 0 ? 0 : 1, right: page === last ? 0 : 1 });

/** A cover swings about the spine, so the half it leaves (or lands on) is covered by its cosine. */
const swing = (from: number, to: number, progress: number) =>
  from === to ? from : Math.max(0, Math.cos(Math.PI * (from === 1 ? progress : 1 - progress)));

export default function Shadow() {
  const shadow = useRef<HTMLDivElement>(null);
  // Straight to the style: this runs every frame of a turn, which is no job for React state.
  const cast = (left: number, right: number) => {
    shadow.current?.style.setProperty("--left", String(left));
    shadow.current?.style.setProperty("--right", String(right));
  };
  return (
    <div className="book" style={{ position: "relative" }}>
      <div
        ref={shadow}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "calc(50% * (1 - var(--left, 0)))",
          right: "calc(50% * (1 - var(--right, 1)))",
          boxShadow: "0 1.5rem 2.5rem rgb(0 0 0 / 0.45)",
        }}
      />
      <FlipBook
        width={400}
        height={560}
        size="stretch"
        // Always a spread, so `resting` can stay this simple: a single page covers the whole table.
        layout="spread"
        cover
        // Turns with no animation (`turnTo`, say) only fire `flip`.
        onFlip={(e) => {
          const { left, right } = resting(e.page);
          cast(left, right);
        }}
        // Animated, dragged or dropped back, every turn reports where it is between two spreads.
        onFlipProgress={({ from, to, progress }) =>
          cast(
            swing(resting(from).left, resting(to).left, progress),
            swing(resting(from).right, resting(to).right, progress),
          )
        }
      >
        {titles.map((title, i) => (
          <Page
            key={title}
            density={i === 0 || i === last ? "hard" : "soft"}
            className={i === 0 || i === last ? "page page-cover" : "page"}
          >
            <h3>{title}</h3>
          </Page>
        ))}
      </FlipBook>
    </div>
  );
}
