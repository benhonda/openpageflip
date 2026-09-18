import { type PointerEvent as ReactPointerEvent, useState } from "react";
import { compact, type Point, percent, type Source, signed, whole } from "./data.ts";

/** Mouse hover ends when the pointer leaves; a touch has no hover to end, so its reading stays up. */
const mouseOnly =
  (clear: () => void) =>
  (event: ReactPointerEvent): void => {
    if (event.pointerType === "mouse") clear();
  };

// The line chart's drawing area, in viewBox units.
const VIEW = { width: 400, height: 230 };
const PLOT = { left: 10, right: 390, top: 50, bottom: 210 };

/** Sessions over the range. Give it `key={range}` so a reading from one range never outlives it. */
export function TrafficChart({ series }: { series: readonly Point[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const values = series.map((p) => p.sessions);
  const max = Math.max(...values);
  const low = Math.min(...values);
  // The floor sits a little under the lowest point so the trough still clears the baseline.
  const min = low * 0.9;
  const step = (PLOT.right - PLOT.left) / (series.length - 1);
  const x = (i: number): number => PLOT.left + i * step;
  const y = (v: number): number =>
    PLOT.bottom - ((v - min) / (max - min)) * (PLOT.bottom - PLOT.top);

  const line = series
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.sessions).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${PLOT.right} ${PLOT.bottom} L${PLOT.left} ${PLOT.bottom} Z`;

  const first = series.at(0);
  const last = series.at(-1);
  const read = hover === null ? undefined : series[hover];
  // Left by the same fraction it is shifted back, so the tip tracks the point and never leaves the chart.
  const tipAt = hover === null ? 0 : (x(hover) / VIEW.width) * 100;

  return (
    <div className="sr-chart">
      <svg
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        role="img"
        aria-label={`Sessions from ${first?.label} to ${last?.label}, between ${compact(low)} and ${compact(max)}`}
        onPointerLeave={mouseOnly(() => setHover(null))}
      >
        <line
          className="sr-axis"
          x1={PLOT.left}
          y1={PLOT.bottom}
          x2={PLOT.right}
          y2={PLOT.bottom}
        />
        {[130, PLOT.top].map((gy) => (
          <line key={gy} className="sr-grid" x1={PLOT.left} y1={gy} x2={PLOT.right} y2={gy} />
        ))}
        <path className="sr-area" d={area} />
        <path className="sr-line" d={line} />
        {series.map((p, i) => (
          <g key={p.label}>
            {/* `data-opf-no-flip`: reading the chart near the page edge must not take hold of the page. */}
            <rect
              x={x(i) - step / 2}
              y={0}
              width={step}
              height={VIEW.height}
              fill="transparent"
              data-opf-no-flip
              onPointerEnter={() => setHover(i)}
            />
            {hover === i && (
              <>
                <line
                  className="sr-marker"
                  x1={x(i)}
                  y1={y(p.sessions)}
                  x2={x(i)}
                  y2={PLOT.bottom}
                />
                <circle className="sr-marker-dot" cx={x(i)} cy={y(p.sessions)} r={4} />
              </>
            )}
          </g>
        ))}
        <text className="sr-tick" x={PLOT.left} y={226}>
          {first?.label}
        </text>
        <text className="sr-tick" x={PLOT.right} y={226} textAnchor="end">
          {last?.label}
        </text>
        <text className="sr-tick sr-tick--y" x={388} y={46} textAnchor="end">
          {compact(max)}
        </text>
        <text className="sr-tick sr-tick--y" x={388} y={126} textAnchor="end">
          {compact(min + (max - min) / 2)}
        </text>
      </svg>
      {read !== undefined && (
        <div className="sr-tip" style={{ left: `${tipAt}%`, transform: `translateX(-${tipAt}%)` }}>
          {read.label} · {whole(read.sessions)}
        </div>
      )}
    </div>
  );
}

/** Each source's share as a bar scaled to the leader, and the count behind the bar under the pointer. */
export function SourceBars({
  sources,
  sessions,
}: {
  sources: readonly Source[];
  sessions: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const leader = Math.max(...sources.map((s) => s.share));
  const read = hover === null ? undefined : sources[hover];

  return (
    <>
      <div className="sr-bars" onPointerLeave={mouseOnly(() => setHover(null))}>
        {sources.map((s, i) => (
          <div
            key={s.name}
            className="sr-bar"
            data-active={hover === i}
            onPointerEnter={() => setHover(i)}
          >
            <span>{s.name}</span>
            <span className="sr-bar-track">
              <span className="sr-bar-fill" style={{ width: percent(s.share / leader, 1) }} />
            </span>
            <span className="sr-mono">{percent(s.share, 1)}</span>
          </div>
        ))}
      </div>
      <p className="sr-foot sr-mono" aria-live="polite">
        {read === undefined
          ? "Hover or tap a bar for the count."
          : `${read.name}: ${whole(sessions * read.share)} sessions · ${signed((read.share - read.prev) * 100)} pts vs prior`}
      </p>
    </>
  );
}
