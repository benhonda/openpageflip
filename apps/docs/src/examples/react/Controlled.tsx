import "@openpageflip/core/styles.css";
import { FlipBook, Page } from "@openpageflip/react";
import { useState } from "react";

const chapters = [
  "Cover",
  "Chapter one",
  "Chapter two",
  "Chapter three",
  "Chapter four",
  "The end",
];

export default function Controlled() {
  const [page, setPage] = useState(0);
  return (
    <>
      {/* `page` drives the book; `onFlip` reports where it landed, so the two never disagree. */}
      <FlipBook
        className="book"
        width={400}
        height={560}
        size="stretch"
        cover
        page={page}
        onFlip={(e) => setPage(e.page)}
      >
        {chapters.map((title, i) => {
          const isCover = i === 0 || i === chapters.length - 1;
          return (
            <Page
              key={title}
              density={isCover ? "hard" : "soft"}
              className={isCover ? "page page-cover" : "page"}
            >
              <h3>{title}</h3>
            </Page>
          );
        })}
      </FlipBook>
      <p className="controls">
        <label>
          Go to{" "}
          <select value={page} onChange={(e) => setPage(Number(e.target.value))}>
            {chapters.map((title, i) => (
              <option key={title} value={i}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <span>
          Showing page {page + 1} of {chapters.length}
        </span>
      </p>
    </>
  );
}
