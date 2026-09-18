import type { ReactNode } from "react";
import { SourceBars, TrafficChart } from "./charts.tsx";
import {
  change,
  compact,
  ISSUE_DATE,
  improved,
  type Measure,
  minutes,
  percent,
  type Report,
  signed,
  whole,
} from "./data.ts";

/**
 * What a page's content sits in. The book lays the page element out itself (absolutely placed,
 * `display: block`), so the page's own layout lives one level in. The sheet is also a size
 * container: site-report.css sizes everything on it in 480ths of its width, which keeps a page
 * the same page at any size the book stretches to.
 */
function Sheet({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="sr-sheet">
      <div className={className === undefined ? "sr-body" : `sr-body ${className}`}>{children}</div>
    </div>
  );
}

function Delta({ of, lowerIsBetter }: { of: Measure; lowerIsBetter?: boolean }) {
  return <span data-good={improved(of, lowerIsBetter)}>{change(of)}</span>;
}

type PageProps = { report: Report };

/** The sections Contents lists, by the page each one opens on. */
const SECTIONS = [
  { title: "Highlights", sub: "The period in five numbers", page: 3 },
  { title: "Traffic overview", sub: "Sessions over time, peaks and troughs", page: 5 },
  { title: "Acquisition", sub: "Where the visits came from", page: 7 },
  { title: "Top pages", sub: "What people actually read", page: 9 },
] as const;

const folio = (page: number): string => String(page).padStart(2, "0");

export function Cover({ report }: PageProps) {
  return (
    <Sheet className="sr-body--spread">
      <div className="sr-masthead sr-mono">
        <span>Demo issue</span>
        <span>{ISSUE_DATE}</span>
      </div>
      <div>
        <h2 className="sr-title">
          The
          <br />
          Site
          <br />
          Report
        </h2>
        <p className="sr-standfirst">
          A demo: one period of web traffic, read like a magazine instead of a dashboard.
        </p>
      </div>
      <div className="sr-mono">Sample data · {report.label}</div>
    </Sheet>
  );
}

export function Colophon() {
  return (
    <Sheet>
      <div className="sr-eyebrow sr-eyebrow--muted">Colophon</div>
      <h2 className="sr-headline">How this issue was made</h2>
      <div className="sr-copy">
        <p>
          This is a demo. Every figure is generated sample data standing in for a real site’s
          first-party event tracking. Sessions end after 30 minutes of inactivity. Sources follow
          the medium of the first pageview in a session.
        </p>
        <p>
          Every chart is drawn live from the selected range, so the same issue can be reread for any
          period.
        </p>
      </div>
      <p className="sr-foot sr-mono">
        Set in Newsreader and IBM Plex.
        <br />
        Published {ISSUE_DATE}.
      </p>
    </Sheet>
  );
}

export function Contents({ onJump }: { onJump: (page: number) => void }) {
  return (
    <Sheet>
      <div className="sr-eyebrow sr-eyebrow--muted">Contents</div>
      <h2 className="sr-headline sr-headline--contents">In this issue</h2>
      <div className="sr-toc">
        {SECTIONS.map((s) => (
          <button key={s.page} type="button" onClick={() => onJump(s.page)}>
            <span className="sr-toc-text">
              <span className="sr-toc-title">{s.title}</span>
              <span className="sr-toc-sub">{s.sub}</span>
            </span>
            <span className="sr-mono">{folio(s.page)}</span>
          </button>
        ))}
      </div>
      <p className="sr-foot sr-foot--note">
        Tap a line to jump there. Change the date range above and every chart in the issue is
        redrawn.
      </p>
    </Sheet>
  );
}

export function HighlightsNumbers({ report }: PageProps) {
  const kpis = [
    { label: "Sessions", value: compact(report.sessions.now), of: report.sessions },
    { label: "Users", value: compact(report.users.now), of: report.users },
    { label: "Pageviews", value: compact(report.pageviews.now), of: report.pageviews },
    { label: "Avg. time on site", value: minutes(report.duration.now), of: report.duration },
    { label: "Bounce rate", value: percent(report.bounce.now), of: report.bounce, lower: true },
  ];
  return (
    <Sheet>
      <div className="sr-eyebrow">Highlights</div>
      <h2 className="sr-headline sr-headline--roomy">The period in five numbers</h2>
      <div className="sr-kpis">
        {kpis.map((k) => (
          <div key={k.label}>
            <div className="sr-kpi-label">{k.label}</div>
            <div className="sr-kpi-value">{k.value}</div>
            <div className="sr-mono">
              <Delta of={k.of} lowerIsBetter={k.lower === true} />
            </div>
          </div>
        ))}
      </div>
      <p className="sr-foot sr-mono">Deltas against the preceding period of equal length.</p>
    </Sheet>
  );
}

export function HighlightsQuote({ report }: PageProps) {
  const [lead, second] = report.sources;
  const [top] = report.pages;
  return (
    <Sheet className="sr-body--centred">
      <p className="sr-quote">
        “{lead.name} carried {percent(lead.share)} of the period, and the site grew anyway.”
      </p>
      <div className="sr-quote-rule" />
      <p className="sr-copy">
        Across {report.label.toLowerCase()}, the demo site recorded {whole(report.sessions.now)}{" "}
        sessions, {change(report.sessions)} against the period before. {lead.name} remained the
        largest source at {percent(lead.share)}, with {second.name.toLowerCase()} at{" "}
        {percent(second.share)}. The most-read page was “{top.title}”, at {whole(top.views.now)}{" "}
        views.
      </p>
    </Sheet>
  );
}

export function TrafficOverview({ report }: PageProps) {
  return (
    <Sheet>
      <div className="sr-eyebrow sr-eyebrow--split">
        <span>01 · Traffic overview</span>
        <span>Sessions</span>
      </div>
      <div className="sr-bignum">{whole(report.sessions.now)}</div>
      <div className="sr-mono sr-bignum-delta">
        <Delta of={report.sessions} /> vs previous period
      </div>
      <TrafficChart key={report.range} series={report.series} />
    </Sheet>
  );
}

export function TrafficStory({ report }: PageProps) {
  const daily = report.range === "30d";
  const average = whole(report.sessions.now / report.days);
  return (
    <Sheet>
      <h2 className="sr-headline">
        {daily ? "Quiet weekends, a busy finish" : "A slow middle, a busy finish"}
      </h2>
      <div className="sr-copy">
        <p>
          Sessions rose {percent(report.sessions.now / report.sessions.prev - 1, 1)} on the prior
          period.{" "}
          {daily
            ? "The line sags every weekend, which is normal for a docs site, since people look things up while they’re at work."
            : "Traffic sagged through the middle of the range and came back towards the end, and the recovery lines up with the 1.0 release."}
        </p>
        <p>
          The busiest point was {report.peak.label}, with {whole(report.peak.sessions)} sessions.
          The quietest was {report.trough.label}. Between them the site averaged {average} sessions
          a day.
        </p>
      </div>
      <div className="sr-foot sr-stats">
        <Stat label="Peak" value={compact(report.peak.sessions)} note={report.peak.label} />
        <Stat label="Trough" value={compact(report.trough.sessions)} note={report.trough.label} />
        <Stat label="Daily average" value={average} note="sessions" />
      </div>
    </Sheet>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <div className="sr-stat-label">{label}</div>
      <div className="sr-stat-value">{value}</div>
      <div className="sr-mono">{note}</div>
    </div>
  );
}

export function AcquisitionShares({ report }: PageProps) {
  return (
    <Sheet>
      <div className="sr-eyebrow sr-eyebrow--split">
        <span>02 · Acquisition</span>
        <span>Share of sessions</span>
      </div>
      <h2 className="sr-headline sr-headline--roomy">Where the visits came from</h2>
      <SourceBars key={report.range} sources={report.sources} sessions={report.sessions.now} />
    </Sheet>
  );
}

export function AcquisitionStory({ report }: PageProps) {
  const [lead, second, third] = report.sources;
  const moves = report.sources
    .map((s) => ({ name: s.name, points: (s.share - s.prev) * 100 }))
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 3);
  return (
    <Sheet>
      <h2 className="sr-headline">{lead.name} does the heavy lifting</h2>
      <div className="sr-copy">
        <p>
          {percent(lead.share)} of sessions started with someone searching for an answer and landing
          on the docs. For a library that’s the traffic you want, because those people already have
          a problem the docs can solve. {second.name} follows at {percent(second.share)}, which is
          mostly bookmarks and typed URLs from people who’ve been before.
        </p>
        <p>
          {third.name} sits at {percent(third.share)}, nearly all of it from the README. The
          newsletter and social are small. The three biggest moves in share against the prior period
          are listed below.
        </p>
      </div>
      <div className="sr-foot sr-moves">
        {moves.map((m) => (
          <div key={m.name}>
            <span>{m.name}</span>
            <span className="sr-mono" data-good={m.points >= 0}>
              {signed(m.points)} pts share
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function TopPagesList({ report }: PageProps) {
  return (
    <Sheet>
      <div className="sr-eyebrow sr-eyebrow--split">
        <span>03 · Top pages</span>
        <span>Pageviews</span>
      </div>
      <h2 className="sr-headline">The pages people actually read</h2>
      <ol className="sr-ranked">
        {report.pages.map((p, i) => (
          <li key={p.path}>
            <span className="sr-mono">{folio(i + 1)}</span>
            <span className="sr-ranked-name">
              <span className="sr-ranked-title">{p.title}</span>
              <span className="sr-mono">{p.path}</span>
            </span>
            <span className="sr-ranked-views sr-mono">
              <span>{whole(p.views.now)}</span>
              <Delta of={p.views} />
            </span>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

export function TopPagesStory({ report }: PageProps) {
  const [top, second] = report.pages;
  const topSix = report.pages.reduce((sum, p) => sum + p.share, 0);
  return (
    <Sheet>
      <h2 className="sr-headline">Getting started first, migrating second</h2>
      <div className="sr-copy">
        <p>
          “{top.title}” took {whole(top.views.now)} views, {percent(top.share / topSix)} of the top
          six. People arrive with a practical question and that page answers it, which is why it
          outranks the home page.
        </p>
        <p>
          “{second.title}” is second at {whole(second.views.now)} views. It’s the one to watch,
          because it’s the page people read when they’re actually switching over.
        </p>
      </div>
      <div className="sr-foot">
        <div className="sr-columns" role="img" aria-label="Pageviews of the top six pages">
          {report.pages.map((p) => (
            <span
              key={p.path}
              title={p.title}
              style={{ height: percent(p.views.now / top.views.now) }}
            />
          ))}
        </div>
        <div className="sr-columns-caption sr-mono">
          <span>Share of top-6 pageviews</span>
          <span>{percent(topSix)} of all views</span>
        </div>
      </div>
    </Sheet>
  );
}

export function BackCover({ report, onRestart }: PageProps & { onRestart: () => void }) {
  return (
    <Sheet className="sr-body--spread">
      <div className="sr-masthead sr-mono">Demo issue · {report.label}</div>
      <p className="sr-signoff">Next issue: whatever the numbers say.</p>
      <button type="button" className="sr-pill sr-mono" onClick={onRestart}>
        Back to cover
      </button>
    </Sheet>
  );
}
