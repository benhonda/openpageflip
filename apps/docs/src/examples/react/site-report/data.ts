/**
 * Sample analytics for The Site Report. Everything is generated from a fixed seed per range, so
 * a range always reads the same, on the server and in the browser. Swap `buildReport` for a real
 * query and the pages don't change.
 */

/** The issue date. Fixed, like a printed magazine's: labels count back from here. */
const ISSUE = new Date(2026, 8, 18);
export const ISSUE_DATE = "September 2026";

export const RANGE_KEYS = ["30d", "90d", "12m"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

type RangeSpec = {
  readonly short: string;
  readonly label: string;
  /** Points on the line chart. */
  readonly points: number;
  readonly days: number;
  /** Sessions per point, before the trend and the noise. */
  readonly base: number;
  readonly seed: number;
};

export const RANGES: Record<RangeKey, RangeSpec> = {
  "30d": { short: "30 days", label: "Last 30 days", points: 30, days: 30, base: 2150, seed: 11 },
  "90d": { short: "90 days", label: "Last 90 days", points: 13, days: 90, base: 14600, seed: 23 },
  "12m": {
    short: "12 months",
    label: "Last 12 months",
    points: 12,
    days: 365,
    base: 61000,
    seed: 37,
  },
};

/** A value beside the same value for the preceding period of equal length. */
export type Measure = { readonly now: number; readonly prev: number };

export type Point = { readonly label: string; readonly sessions: number };

/** `share` and `prev` are fractions of all sessions. */
export type Source = { readonly name: string; readonly share: number; readonly prev: number };

/** `share` is the page's fraction of all pageviews. */
export type TopPage = {
  readonly title: string;
  readonly path: string;
  readonly views: Measure;
  readonly share: number;
};

export type Report = {
  readonly range: RangeKey;
  readonly label: string;
  readonly days: number;
  readonly series: readonly Point[];
  readonly peak: Point;
  readonly trough: Point;
  readonly sessions: Measure;
  readonly users: Measure;
  readonly pageviews: Measure;
  /** Seconds. */
  readonly duration: Measure;
  /** A fraction of sessions. */
  readonly bounce: Measure;
  /** Largest share first. */
  readonly sources: readonly [Source, Source, Source, ...Source[]];
  /** Most views first. */
  readonly pages: readonly [TopPage, TopPage, ...TopPage[]];
};

const SOURCES = [
  { name: "Organic search", share: 0.41, spread: 0.06, prev: 0.39 },
  { name: "Direct", share: 0.19, spread: 0.04, prev: 0.2 },
  { name: "GitHub", share: 0.14, spread: 0.04, prev: 0.16 },
  { name: "Referral", share: 0.09, spread: 0.03, prev: 0.09 },
  { name: "Newsletter", share: 0.07, spread: 0.03, prev: 0.06 },
  { name: "Social", share: 0.04, spread: 0.02, prev: 0.05 },
] as const;

const PAGES = [
  { title: "Getting started", path: "/start/", share: 0.19 },
  { title: "Migrating from 2.x", path: "/start/migrate/", share: 0.15 },
  { title: "API reference", path: "/api/", share: 0.12 },
  { title: "Examples", path: "/examples/", share: 0.09 },
  { title: "Frequently asked questions", path: "/faq/", share: 0.07 },
  { title: "Changelog", path: "/changelog/", share: 0.05 },
] as const;

/** A small linear congruential generator: the same seed gives the same numbers everywhere. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function labelsFor(range: RangeKey, count: number): string[] {
  const back = (i: number): Date => {
    const d = new Date(ISSUE);
    if (range === "30d") d.setDate(ISSUE.getDate() - i);
    else if (range === "90d") d.setDate(ISSUE.getDate() - i * 7);
    else d.setMonth(ISSUE.getMonth() - i);
    return d;
  };
  const format = (d: Date): string =>
    range === "12m"
      ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      : `${range === "90d" ? "Wk of " : ""}${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return Array.from({ length: count }, (_, i) => format(back(count - 1 - i)));
}

/** The point a comparison prefers; the earliest wins a tie. */
function extreme(series: readonly Point[], prefer: (a: number, b: number) => boolean): Point {
  const [first, ...rest] = series;
  if (first === undefined) throw new Error("a report needs at least one point");
  return rest.reduce((best, p) => (prefer(p.sessions, best.sessions) ? p : best), first);
}

export function buildReport(range: RangeKey): Report {
  const spec = RANGES[range];
  const rnd = seeded(spec.seed);

  const labels = labelsFor(range, spec.points);
  const series = labels.map((label, i): Point => {
    const trend = 1 + 0.18 * (i / (spec.points - 1));
    const wave = 1 + 0.16 * Math.sin((i / spec.points) * Math.PI * 2.6 + 0.8);
    // Daily points sag at the weekend; the ranges above a day hide it.
    const weekend = range === "30d" && (i % 7 === 5 || i % 7 === 6) ? 0.72 : 1;
    return { label, sessions: spec.base * trend * wave * weekend * (0.9 + rnd() * 0.2) };
  });

  const total = series.reduce((sum, p) => sum + p.sessions, 0);
  // The prior period is always 4 to 16% smaller: the sample only grows, and the copy says "rose".
  const prevTotal = total / (1.04 + rnd() * 0.12);

  const drawn = SOURCES.map((s) => ({ ...s, share: s.share + rnd() * s.spread }));
  const drawnSum = drawn.reduce((sum, s) => sum + s.share, 0);
  const [s1, s2, s3, ...sRest] = drawn.map(
    (s): Source => ({ name: s.name, share: s.share / drawnSum, prev: s.prev }),
  );

  const pageviews = total * (2.3 + rnd() * 0.4);
  const [p1, p2, ...pRest] = PAGES.map(
    (p): TopPage => ({
      title: p.title,
      path: p.path,
      share: p.share,
      views: {
        now: pageviews * p.share * (0.9 + rnd() * 0.2),
        prev: pageviews * p.share * (0.85 + rnd() * 0.3),
      },
    }),
  );
  if (!s1 || !s2 || !s3 || !p1 || !p2) throw new Error("SOURCES or PAGES lost an entry");

  return {
    range,
    label: spec.label,
    days: spec.days,
    series,
    peak: extreme(series, (a, b) => a > b),
    trough: extreme(series, (a, b) => a < b),
    sessions: { now: total, prev: prevTotal },
    users: { now: total * 0.78, prev: prevTotal * 0.8 },
    pageviews: { now: pageviews, prev: prevTotal * 2.4 },
    bounce: { now: 0.41 + rnd() * 0.08, prev: 0.45 },
    duration: { now: 118 + rnd() * 40, prev: 122 },
    sources: [s1, s2, s3, ...sRest],
    pages: [p1, p2, ...pRest],
  };
}

/** `12,345` */
export const whole = (n: number): string => Math.round(n).toLocaleString("en-US");

/** `61k`, `6.1k`, `612` */
export const compact = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n));

/** `43%` of a fraction, or `43.1%` with a decimal. */
export const percent = (fraction: number, decimals = 0): string =>
  `${(fraction * 100).toFixed(decimals)}%`;

/** `+1.6` or `−0.4`, with a true minus sign. */
export const signed = (n: number): string => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;

/** `+12.3%` or `−4.1%` against the preceding period. */
export const change = (m: Measure): string => `${signed(((m.now - m.prev) / m.prev) * 100)}%`;

/** Whether a move is good news. A bounce rate is the one measure where down is up. */
export const improved = (m: Measure, lowerIsBetter = false): boolean =>
  lowerIsBetter ? m.now <= m.prev : m.now >= m.prev;

/** `2m 14s` */
export const minutes = (seconds: number): string => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
};
