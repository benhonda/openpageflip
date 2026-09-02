/**
 * Every option as a control, the book's API as buttons, and what the book reports as it goes.
 * The code panel is generated from the panel's state, so it always shows exactly the options the
 * book on screen is running with.
 */
import "@openpageflip/core/styles.css";
import {
  type Book,
  type BookOptions,
  ClickMode,
  FlipCorner,
  FlipState,
  Layout,
  Orientation,
  SizeMode,
} from "@openpageflip/core";
import { FlipBook, Page } from "@openpageflip/react";
import { type ReactElement, useRef, useState } from "react";

/**
 * Easing presets with the source the code panel prints. A bundler rewrites the function, so
 * `toString()` would show mangled code; `test/playground.test.tsx` checks each source still
 * describes its function.
 */
export const EASINGS = {
  linear: { source: "(t) => t", fn: (t: number) => t },
  "ease-in": { source: "(t) => t * t", fn: (t: number) => t * t },
  "ease-out": { source: "(t) => 1 - (1 - t) ** 2", fn: (t: number) => 1 - (1 - t) ** 2 },
  "ease-in-out": {
    source: "(t) => (t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2)",
    fn: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2),
  },
} as const;
type Easing = keyof typeof EASINGS;
// `Object.keys` is typed string[] whatever the object; this is the one narrowing TS cannot do.
const EASING_NAMES = Object.keys(EASINGS) as readonly Easing[];

type Settings = {
  cover: boolean;
  layout: Layout;
  size: SizeMode;
  width: number;
  height: number;
  flipDuration: number;
  easing: Easing;
  shadows: boolean;
  shadowOpacity: number;
  click: ClickMode;
  drag: boolean;
  swipe: boolean;
  swipeDistance: number;
  hoverCorners: boolean;
  /** true keeps the library's default selector; false lets form controls start a flip too. */
  ignoreDragOn: boolean;
};

/** Where the playground starts. Not the library's defaults: the code panel prints every value. */
const INITIAL: Settings = {
  cover: true,
  layout: Layout.auto,
  size: SizeMode.stretch,
  width: 300,
  height: 420,
  flipDuration: 1000,
  easing: "linear",
  shadows: true,
  shadowOpacity: 1,
  click: ClickMode.anywhere,
  drag: true,
  swipe: true,
  swipeDistance: 30,
  hoverCorners: true,
  ignoreDragOn: true,
};

type Options = Omit<BookOptions, "pages">;

/** The options the book gets. `ignoreDragOn` is left out when the library's default applies. */
function toOptions(s: Settings): Options {
  return {
    width: s.width,
    height: s.height,
    size: s.size,
    layout: s.layout,
    cover: s.cover,
    flipDuration: s.flipDuration,
    easing: EASINGS[s.easing].fn,
    shadows: s.shadows,
    shadowOpacity: s.shadowOpacity,
    click: s.click,
    drag: s.drag,
    swipe: s.swipe,
    swipeDistance: s.swipeDistance,
    hoverCorners: s.hoverCorners,
    ...(s.ignoreDragOn ? {} : { ignoreDragOn: false }),
  };
}

/** The option values as source: literals as JSON, the easing as its preset's source. */
function sources(options: Options, easing: Easing): [string, string][] {
  return Object.entries(options).map(([key, value]) => [
    key,
    typeof value === "function" ? EASINGS[easing].source : JSON.stringify(value),
  ]);
}

function coreSnippet(entries: readonly [string, string][]): string {
  return [
    'import "@openpageflip/core/styles.css";',
    'import { createBook } from "@openpageflip/core";',
    "",
    "const book = createBook(container, {",
    ...entries.map(([key, value]) => `  ${key}: ${value},`),
    "});",
  ].join("\n");
}

function reactSnippet(entries: readonly [string, string][]): string {
  return [
    'import "@openpageflip/core/styles.css";',
    'import { FlipBook, Page } from "@openpageflip/react";',
    "",
    "<FlipBook",
    ...entries.map(([key, value]) =>
      value === "true"
        ? `  ${key}`
        : value.startsWith('"')
          ? `  ${key}=${value}`
          : `  ${key}={${value}}`,
    ),
    ">",
    '  {/* one child per page; <Page density="hard"> for covers */}',
    "</FlipBook>",
  ].join("\n");
}

// ---- controls: each one typed by what it sets, so no handler needs a cast ----

function Choice<T extends string>(props: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  render?: (value: T) => string;
}): ReactElement {
  return (
    <label>
      {props.label}
      <select
        value={props.value}
        onChange={(e) => {
          const next = props.options.find((option) => option === e.target.value);
          if (next !== undefined) props.onChange(next);
        }}
      >
        {props.options.map((option) => (
          <option key={option} value={option}>
            {props.render?.(option) ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): ReactElement {
  return (
    <label>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.label}
    </label>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  value: number;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <label>
      {props.label} {props.value}
      {props.unit}
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(e.target.valueAsNumber)}
      />
    </label>
  );
}

// ---- the playground ----

const PAGE_COUNT = 10;
const FORM_PAGE = 4;
const pageTitles = Array.from({ length: PAGE_COUNT }, (_, i) =>
  i === 0 ? "OpenPageFlip" : i === PAGE_COUNT - 1 ? "The end" : `Page ${i + 1}`,
);
const pageIndices = pageTitles.map((_, i) => String(i));

type LogEntry = { readonly id: number; readonly text: string };

export default function Playground(): ReactElement {
  const book = useRef<Book>(null);
  const [settings, setSettings] = useState(INITIAL);
  const [page, setPage] = useState(0);
  const [state, setState] = useState<FlipState>(FlipState.read);
  const [orientation, setOrientation] = useState<Orientation>(Orientation.landscape);
  const [corner, setCorner] = useState<FlipCorner>(FlipCorner.top);
  const [clicks, setClicks] = useState(0);
  const [log, setLog] = useState<readonly LogEntry[]>([]);
  const nextId = useRef(0);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    setSettings((s) => ({ ...s, [key]: value }));
  const record = (text: string): void =>
    setLog((entries) => [{ id: nextId.current++, text }, ...entries].slice(0, 8));

  const options = toOptions(settings);
  const entries = sources(options, settings.easing);
  const isCover = (i: number): boolean => settings.cover && (i === 0 || i === PAGE_COUNT - 1);

  return (
    <div className="playground">
      <FlipBook
        ref={book}
        className="book"
        {...options}
        page={page}
        onInit={(e) => {
          setPage(e.page);
          setOrientation(e.orientation);
          record(`init: page ${e.page}, ${e.orientation}`);
        }}
        onFlip={(e) => {
          setPage(e.page);
          record(`flip: page ${e.page}`);
        }}
        onChangeState={(e) => {
          setState(e.state);
          record(`changeState: ${e.state}`);
        }}
        onChangeOrientation={(e) => {
          setOrientation(e.orientation);
          record(`changeOrientation: ${e.orientation}`);
        }}
      >
        {pageTitles.map((title, i) => (
          <Page
            key={title}
            density={isCover(i) ? "hard" : "soft"}
            className={isCover(i) ? "page page-cover" : "page"}
          >
            {isCover(i) ? <h2>{title}</h2> : <h3>{title}</h3>}
            {i === FORM_PAGE ? (
              <p>
                <button type="button" onClick={() => setClicks((c) => c + 1)}>
                  Clicked {clicks} times
                </button>
                <br />
                With "Leave form controls alone" on, this button never starts a flip.
              </p>
            ) : (
              <p>Drag a corner, click, or swipe.</p>
            )}
          </Page>
        ))}
      </FlipBook>

      <p className="controls readout" aria-live="polite">
        <span>
          Page {page + 1} of {PAGE_COUNT}
        </span>
        <span>state: {state}</span>
        <span>orientation: {orientation}</span>
      </p>

      <div className="panel">
        <fieldset>
          <legend>API</legend>
          <Choice
            label="Corner"
            options={Object.values(FlipCorner)}
            value={corner}
            onChange={setCorner}
          />
          <button type="button" onClick={() => void book.current?.flipPrev(corner)}>
            flipPrev
          </button>
          <button type="button" onClick={() => void book.current?.flipNext(corner)}>
            flipNext
          </button>
          <Choice
            label="flipTo"
            options={pageIndices}
            value={String(page)}
            onChange={(index) => void book.current?.flipTo(Number(index), corner)}
            render={(index) => `${Number(index) + 1}: ${pageTitles[Number(index)]}`}
          />
          <button type="button" onClick={() => book.current?.turnTo(PAGE_COUNT - 1)}>
            turnTo last (no animation)
          </button>
        </fieldset>

        <fieldset>
          <legend>Look</legend>
          <Toggle label="Cover" checked={settings.cover} onChange={(v) => set("cover", v)} />
          <Choice
            label="Layout"
            options={Object.values(Layout)}
            value={settings.layout}
            onChange={(v) => set("layout", v)}
          />
          <Choice
            label="Size"
            options={Object.values(SizeMode)}
            value={settings.size}
            onChange={(v) => set("size", v)}
          />
          {settings.size === SizeMode.stretch && (
            <p className="hint">
              Stretched to fit the container - width and height only set the page's ratio.
            </p>
          )}
          <Slider
            label="Width"
            min={150}
            max={350}
            value={settings.width}
            onChange={(v) => set("width", v)}
          />
          <Slider
            label="Height"
            min={200}
            max={500}
            value={settings.height}
            onChange={(v) => set("height", v)}
          />
          <Toggle label="Shadows" checked={settings.shadows} onChange={(v) => set("shadows", v)} />
          <Slider
            label="Shadow opacity"
            min={0}
            max={1}
            step={0.1}
            value={settings.shadowOpacity}
            onChange={(v) => set("shadowOpacity", v)}
          />
        </fieldset>

        <fieldset>
          <legend>Motion</legend>
          <Slider
            label="Flip duration"
            min={100}
            max={3000}
            step={100}
            unit=" ms"
            value={settings.flipDuration}
            onChange={(v) => set("flipDuration", v)}
          />
          <Choice
            label="Easing"
            options={EASING_NAMES}
            value={settings.easing}
            onChange={(v) => set("easing", v)}
          />
        </fieldset>

        <fieldset>
          <legend>Input</legend>
          <Choice
            label="Click"
            options={Object.values(ClickMode)}
            value={settings.click}
            onChange={(v) => set("click", v)}
          />
          <Toggle label="Drag" checked={settings.drag} onChange={(v) => set("drag", v)} />
          <Toggle label="Swipe" checked={settings.swipe} onChange={(v) => set("swipe", v)} />
          <Slider
            label="Swipe distance"
            min={5}
            max={200}
            step={5}
            value={settings.swipeDistance}
            onChange={(v) => set("swipeDistance", v)}
          />
          <Toggle
            label="Hover corners"
            checked={settings.hoverCorners}
            onChange={(v) => set("hoverCorners", v)}
          />
          <Toggle
            label="Leave form controls alone"
            checked={settings.ignoreDragOn}
            onChange={(v) => set("ignoreDragOn", v)}
          />
        </fieldset>

        <fieldset className="log">
          <legend>Events</legend>
          <ol>
            {log.map((entry) => (
              <li key={entry.id}>{entry.text}</li>
            ))}
          </ol>
        </fieldset>
      </div>

      <div className="snippets">
        <pre>
          <code>{coreSnippet(entries)}</code>
        </pre>
        <pre>
          <code>{reactSnippet(entries)}</code>
        </pre>
      </div>
    </div>
  );
}
