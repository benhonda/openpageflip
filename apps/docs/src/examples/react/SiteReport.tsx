import "@openpageflip/core/styles.css";
import "./site-report/site-report.css";
import { type Book, FlipBook, type FlipBookProps, Page } from "@openpageflip/react";
import { type KeyboardEvent, useMemo, useRef, useState } from "react";
import { buildReport, RANGE_KEYS, RANGES, type RangeKey } from "./site-report/data.ts";
import {
  AcquisitionShares,
  AcquisitionStory,
  BackCover,
  Colophon,
  Contents,
  Cover,
  HighlightsNumbers,
  HighlightsQuote,
  TopPagesList,
  TopPagesStory,
  TrafficOverview,
  TrafficStory,
} from "./site-report/pages.tsx";
import { useMediaQuery } from "./site-report/use-media-query.ts";

/** The two settings the tests turn; everything else about the book is the design's. */
type SiteReportProps = Pick<FlipBookProps, "flipDuration" | "layout">;

/** A web-analytics report laid out as a magazine: switch the range and every page is redrawn in place. */
export default function SiteReport({ flipDuration = 900, layout = "auto" }: SiteReportProps) {
  const book = useRef<Book>(null);
  const [range, setRange] = useState<RangeKey>("90d");
  const [page, setPage] = useState(0);
  const [portrait, setPortrait] = useState(false);
  const report = useMemo(() => buildReport(range), [range]);
  // Two pages side by side on a screen narrower than this are too small to read, so the book
  // shows one. site-report.css holds the same breakpoint for the moment before the book mounts.
  const handheld = useMediaQuery("(max-width: 799.98px)");

  const flipTo = (target: number): void => void book.current?.flipTo(target);

  // Every child is a page, in reading order. With `cover`, the first and last sit alone and the
  // rest pair up from page 1, so each chart faces its story.
  const pages = [
    <Page key="cover" density="hard" className="sr-page sr-page--cover">
      <Cover report={report} />
    </Page>,
    <Page key="colophon" className="sr-page">
      <Colophon />
    </Page>,
    <Page key="contents" className="sr-page">
      <Contents onJump={flipTo} />
    </Page>,
    <Page key="highlights" className="sr-page">
      <HighlightsNumbers report={report} />
    </Page>,
    <Page key="highlights-quote" className="sr-page">
      <HighlightsQuote report={report} />
    </Page>,
    <Page key="traffic" className="sr-page">
      <TrafficOverview report={report} />
    </Page>,
    <Page key="traffic-story" className="sr-page">
      <TrafficStory report={report} />
    </Page>,
    <Page key="acquisition" className="sr-page">
      <AcquisitionShares report={report} />
    </Page>,
    <Page key="acquisition-story" className="sr-page">
      <AcquisitionStory report={report} />
    </Page>,
    <Page key="top-pages" className="sr-page">
      <TopPagesList report={report} />
    </Page>,
    <Page key="top-pages-story" className="sr-page">
      <TopPagesStory report={report} />
    </Page>,
    <Page key="back" density="hard" className="sr-page sr-page--back">
      <BackCover report={report} onRestart={() => flipTo(0)} />
    </Page>,
  ];

  const last = pages.length - 1;
  const inside = pages.length - 2;
  const showing =
    page === 0
      ? "Cover"
      : page === last
        ? "Back"
        : `${portrait ? page : `${page}–${page + 1}`} / ${inside}`;

  // The arrow keys turn pages while focus is in the report (the book takes focus on a click or a
  // Tab), so everywhere else on the site they still do what they always did.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowRight") void book.current?.flipNext();
    else if (event.key === "ArrowLeft") void book.current?.flipPrev();
  };

  return (
    <section className="site-report" aria-label="The Site Report" onKeyDown={onKeyDown}>
      <header className="sr-toolbar">
        <div className="sr-toolbar-title">
          <span>The Site Report</span>
          <span className="sr-mono">Sample data · {report.label}</span>
        </div>
        <div className="sr-toolbar-controls">
          <fieldset className="sr-ranges">
            <legend>Date range</legend>
            {RANGE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="sr-mono"
                aria-pressed={key === range}
                onClick={() => setRange(key)}
              >
                {RANGES[key].short}
              </button>
            ))}
          </fieldset>
          <div className="sr-nav">
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => void book.current?.flipPrev()}
            >
              ←
            </button>
            <output className="sr-mono">{showing}</output>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => void book.current?.flipNext()}
            >
              →
            </button>
          </div>
        </div>
      </header>
      {/* biome-ignore lint/a11y/useSemanticElements: a group of pages, not of form fields */}
      <div
        className="sr-stage"
        role="group"
        aria-label="The issue. Arrow keys turn the page."
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the book is what the arrow keys work, so focus needs somewhere to land after a click on a page
        tabIndex={0}
      >
        <FlipBook
          ref={book}
          className="sr-book"
          width={480}
          height={640}
          size="stretch"
          minWidth={240}
          maxWidth={590}
          cover
          flipDuration={flipDuration}
          shadowOpacity={0.35}
          layout={layout === "auto" && handheld ? "single" : layout}
          onInit={(e) => setPortrait(e.orientation === "portrait")}
          onChangeOrientation={(e) => setPortrait(e.orientation === "portrait")}
          onFlip={(e) => setPage(e.page)}
        >
          {pages}
        </FlipBook>
      </div>

      <p className="sr-hint sr-mono">Drag a page edge, click it, or use ← →</p>
    </section>
  );
}
