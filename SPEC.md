# OpenPageFlip

> **Status: DRAFT** · 2026-09-18 · provisional
> Records our thinking as of the date above — NOT a contract. Before acting on anything
> here, confirm it still matches the current goal. When it conflicts with where we're
> actually headed now, the current goal wins: flag the conflict, don't silently obey.

## Goal

Ship `@openpageflip/core` and `@openpageflip/react` as maintained successors to
[Nodlik/StPageFlip](https://github.com/Nodlik/StPageFlip) (npm `page-flip` 2.0.7) and
[Nodlik/react-pageflip](https://github.com/Nodlik/react-pageflip) (2.0.3), both MIT and
untouched since 2021-04. Same look and feel, modern internals, the 2021–2026 issue backlog
closed by design.

## Decisions

- `[settled]` **Rebuild around the kernel.** Keep the original's fold geometry
  (`FlipCalculation` + `Helper`, ~640 lines, pure). Rebuild the rest as a headless,
  strict-TS core with one DOM renderer and a thin React wrapper. Why: strict mode alone
  touches 14 of 19 original files, and single-page mode, RTL, dynamic pages and a11y all
  need state and renderer decoupled.
- `[settled]` **The original is the visual oracle.** Screenshot-parity tests against the
  original demo at fixed drag positions decide whether a change is faithful.
- `[settled]` No canvas renderer in 1.0. Image books render as `<img>` pages through the
  DOM renderer. Renderer interface stays so WebGL/canvas can be added later.
- `[settled]` React 19 only (`peer react ^19`), ref as a prop, `"use client"`.
- `[settled]` ESM + IIFE (CDN global) for core, ESM only for react. No CommonJS.
- `[settled]` 2026-09-22: **`main` is protected and contributions are PRs.** A ruleset
  (`.github/rulesets/main.json`, applied by `task github:protect`) requires a squash-merged PR
  with a green `check` and blocks force pushes. The maintainer and a release GitHub App bypass
  it, because the release workflow pushes the version commit to `main` and the default
  `GITHUB_TOKEN` can never be a bypass actor. Fork PR workflows need maintainer approval to
  run (UI setting). Why not PRs for the maintainer too: a one-person project ships many small
  commits a day and CI already runs on every push to `main` before anything publishes.
- `[settled]` Versions start at 0.x; 1.0.0 is tagged when parity tests and the backlog
  list below are green. Not 3.0: new scope, new API, no continuity claim.
- `[settled]` 2026-09-18: **Every published package shares one version** (Changesets `fixed`
  in `.changeset/config.json`). Independent numbers (core 0.4.0 beside react 0.2.0) said nothing
  about which pair belongs together and read as disorder in the one releases list. The cost, a
  bump for a package that did not change, is small: react already rode along with most core
  releases through its peer range.
- `[settled]` No compatibility shim for the old API. A migration guide covers renames.
- `[settled]` Contact the original author for an npm deprecation notice after 1.0 (Ben's
  call and message, not an agent's).
- `[settled]` 2026-09-10: **Hover, click and drag share one zone, and it is the page's outer
  edge.** The original lifted a corner on hover but clicked and dragged from anywhere, so the cue
  and the action disagreed. `click: "edges"` (the default) makes the strip along each visible
  page's outer edge the only place the cue shows, a click turns or a drag starts. `"anywhere"`
  keeps the original's tap-anywhere, with the hover cue widened to the page to match. The middle
  of a page belongs to the browser: text selects, links click, and a swipe is a touch/pen gesture
  so a quick mouse selection never turns a page. A deliberate departure from the original's
  default, recorded in the migration guide.
- `[settled]` 2026-09-18: **The hover cue is the whole edge furling, and a drag carries on from
  it.** Hovering the edge strip furls the edge: the corner is pulled straight in (`FURL` px, with
  a whisker of tilt so the fold is not degenerate), so the crease runs parallel to the spine and
  the same cue reads on every binding (the bottom edge of a notepad). It holds anywhere along the
  edge and settles when the pointer leaves. 2026-09-22: the crease leans toward the pointer
  (`TILT` px deeper at the pointer's end of the edge, as much shallower at the other, parallel
  midway), so the cue answers the pointer without giving up the whole edge. The peek below stays
  parallel: its shadow is drawn square to the spine. It replaced the nearer-corner lift, which
  was one corner's cue for a whole-edge zone, and the pointer-follow near a corner that came
  with it.
  Drags move the fold by the pointer's travel from where it took hold (the furl's depth when
  there is one), so pulling straight in from anywhere on the edge deepens the furl and pulling
  from a corner folds across; the original moved the corner to wherever the pointer was, which
  snapped a mid-edge press into a diagonal fold. A click on a furled edge flips on from the furl.
  The parity suite drives our drags by travel and no longer compares hover, both listed under
  deliberate differences. Option `hoverCorners` became `hover`.
- `[settled]` 2026-09-18: **In portrait the spine-side edge's cue is a peek.** The page that
  turns back lies in the hidden half, so a furl of its far edge shows nothing, or floats beside
  the book. Its cue is that page pulled `FURL` px over the spine instead: a strip along the
  visible page's spine edge, under the pointer. The kernel counts a corner past the spine as a
  turn half made, so two rules come with it (`Session.peek` in `controller.ts`): a peek let go of
  always goes back, never on, and the renderer draws only what is past the spine, because the
  rest of that page would be a half-page slab beside the book. The fold's shadows hug its crease,
  half a page off stage, so the strip drops one of its own on the page under it
  (`drawPeekShadow`). A press takes it in hand as an ordinary turn, drawn whole, carrying on from
  the peek. Rejected: no cue on that edge (the original's behaviour, an action without a sign),
  and a cue that is not paper (a second visual language). `flipProgress` reports a peek at just
  over a half, which is where that page is.
- `[settled]` 2026-09-18: **Every binding is the same book seen from another side.**
  `binding: "left" | "right" | "top" | "bottom"`. `right` is a right-to-left book (a manga: the
  spine on the right, the cover alone on the left, a swipe to the right reads on), which is the
  left-bound book mirrored; `top` is a notepad or wall calendar, the book transposed; `bottom` is
  both. The fold kernel and the controller never learn the binding: `packages/core/src/axes.ts`
  maps points, sizes and rotations at the three boundaries, layout, input and the renderer, so
  there is one geometry and one controller, and `packages/core/test/binding.test.ts` holds each
  bound book to its left-bound twin pixel for pixel through the same mirror or transpose. RTL is
  a binding, not a `direction` option, because that is what it physically is and it falls out of
  the same map; pages stay in reading order and the binding decides the side. `layout: "auto"`
  means "a spread when two pages fit across the spine": for a left- or right-bound book that is
  the original's width rule; a top- or bottom-bound book that sizes itself is always two pages
  tall, so it is a spread unless `layout` says `single`. **The library does not switch binding at
  a breakpoint.** Whether a book becomes a notepad on a phone, and at what width, is the host's
  call; options are rebuilt on change, and `apps/docs/src/examples/react/Responsive.tsx` shows
  the media-query switch. Rejected: an automatic switch (an opinion, like the original's portrait
  switch that `layout` exists to turn off) and a binding-specific set of `FlipCorner` names
  (`top`/`bottom` are documented as the left and right corners of a vertically bound page).

- `[settled]` 2026-09-18: **A turn reports itself every frame, as `flipProgress`.** A host that
  moves something of its own with the page (a shadow under a book whose cover is closing) needs
  to know where a turn is while it happens; `flip` fires after it lands and `changeState` says
  only that something is moving. The event carries `from`, `to`, `direction` and `progress` 0..1,
  and is read off the frame the controller just drew (`reportProgress` in
  `packages/core/src/controller.ts`), so it covers animated flips, drags and furls alike and
  cannot disagree with the book. Every turn ends on exactly 0 or 1: a landing is reported as 1
  explicitly because the kernel treats the landed point as degenerate, and a turn that is
  dropped, replaced or cut short is closed on 0. Rejected: a destination on `changeState` at
  flip start (a drag has no destination until it is released and never enters `flipping`, and
  the host would still have to copy our duration, which scales with the path and can be cut
  short by a press), and the library drawing a ground shadow itself (a look, not geometry).
  `apps/docs/src/examples/react/Shadow.tsx` is the use it was built for.
- `[settled]` 2026-09-18: **Hover zoom is the host's; the library's part is to work when it is
  scaled.** A zoom is a look (a lens or the whole book, how far, which image), the middle of a
  page already belongs to the browser and hover to the edge strip, and the original has no zoom
  for the oracle to hold one to. What a host cannot do for itself is make a scaled book take
  input correctly, so that is ours: `local` in `packages/core/src/input.ts` brings the pointer
  back into the container's layout pixels (drawn box over layout box, the container's border
  taken off), for `transform: scale()` and CSS `zoom`, even or uneven; rotation and skew are not
  undone. "A book the host has scaled or bordered" in `packages/core/test/book.test.ts` holds a
  scaled book to its plain twin, and `apps/docs/src/examples/react/HoverZoom.tsx` is the zoom,
  built from a CSS scale about the pointer and `changeState`. Rejected: a `zoom` option in core
  (the opinions above, and it would settle pinch zoom below by accident) and a separate zoom
  package (nothing to share until pinch zoom is designed).

### Docs (settled 2026-09-01)

- `[settled]` 2026-09-18: **`opf-page--hard` and `--soft` are what a page is, not how a turn
  draws it.** A soft page backing a hard one is drawn as a board for the turn (`drawingDensity`),
  and the original moved the class with it, so page styling hung on `--soft` blinked off whenever
  a cover moved. It caught the first real book built on the library (the landing page's, and the
  design tool's prototype before it), both following our own stylesheet's advice. The class now
  follows `density` and never changes during a turn; `--flat` and `--turning` are the classes for
  what a page is doing. `packages/core/test/book.test.ts` holds it.
- `[settled]` **The docs site lives in this repo, `apps/docs`** (Astro Starlight), deployed by
  Vercel from `main` (see the hosting assumption under Toolchain). It is also the demo: every
  page runs the library live.
- `[settled]` **Nothing on the site is a second copy of the code.** Each surface has one source:
  - The API reference is generated by TypeDoc from the packages' TSDoc on every build
    (`apps/docs/src/content/docs/api/` is gitignored). `task typecheck` runs TypeDoc's
    validation, so a type the public API refers to but never exports fails the check, and `packages/core/test/options.test.ts` keeps every `@default` tag equal to the
    value `resolveOptions` applies.
  - `apps/docs/src/examples/` is the demo, the code shown beside it (`?raw`), the browser test
    fixture (`apps/docs/test/`) and the README quick start (`task docs:readme` embeds it;
    `task check` fails when a README drifts). A core example runs against the shared
    `pages.html` unless it brings its own `<name>.html`, on the site and in the tests alike.
  - Changelogs are read from `packages/*/CHANGELOG.md`, which Changesets writes. Package names,
    descriptions, install commands and the site URL come from `package.json`.
  - Internal links, including those into the generated reference, are validated at build.
  - Prose is the only hand-written part, and it points at those surfaces instead of restating
    them.
  - `[settled]` 2026-09-02: the site is also served as plain text for AI assistants by
    starlight-llms-txt (`/llms.txt`, `/llms-full.txt`, and a guides-only set), from the same pages.
    The paths are written once in `apps/docs/src/site.ts`; `start/agents.mdx` is the page that
    tells a reader where to point an agent, and its snippets are built from those paths and the
    package manifests, so it cannot name a file or package that does not exist.
  - `[settled]` 2026-09-02: the playground (`apps/docs/src/components/Playground.tsx`) is a site
    component, not an example: every option as a control, the API as buttons, an event log, and
    the options rendered as code generated from the controls' state. It is the second surface,
    for exploring settings; the landing page has its own demo (next).
  - `[settled]` 2026-09-18: **the landing page's demo is a real thing, The Site Report**
    (`apps/docs/src/examples/react/SiteReport.tsx`): a web-analytics report laid out as a
    twelve-page magazine whose range switch redraws every page in place. It replaced the quick
    start there because a book of placeholder pages shows the turn but not why you would want
    one. It is an example like the rest (run live, tested in `apps/docs/test/`), in React because
    the pages are state-driven. Its pages are sized in fractions of the page width, so the issue
    is one picture at every size the book stretches to. The quick start stays on `start/core`.
- `[settled]` **The migration guide is data, not prose**: `apps/docs/src/migration/index.ts` maps
  every key of the vendored `page-flip@2.0.7` / `react-pageflip@2.0.3` API (`upstream.ts`) to
  `keyof BookOptions`, `keyof Book`, `keyof BookEvents` and `keyof FlipBookProps`, so the type
  checker fails the build when either side moves. `start/migrate.mdx` renders it. Keyboard gets
  rows when it lands.

## Toolchain (verified 2026-09-01)

Bun workspaces + catalog · tsdown · TypeScript 7 (`strict`, `verbatimModuleSyntax`,
`isolatedDeclarations`, `erasableSyntaxOnly`) · Biome · Vitest browser mode (Playwright)
· Changesets · npm Trusted Publishing (OIDC) via `npm publish` of a `bun pm pack` tarball
· Astro Starlight + TypeDoc for docs.

- `[assumption]` tsdown is 0.x but is the successor tsup's README points at. Revisit if it
  breaks; Vite lib mode is the fallback.
- `[assumption]` `bun publish` cannot do OIDC yet (oven-sh/bun#22423). Swap the release
  step to `bun publish` when it can.
- `[assumption]` TypeDoc needs the TypeScript JS API, which `typescript@7` no longer ships
  (TypeStrong/typedoc#3098 tracks TS 7.1 support). `apps/docs` pins `typescript@6` for TypeDoc
  only, which is why `bunfig.toml` uses Bun's isolated linker: each package resolves the
  versions it declares. Drop the pin when TypeDoc supports TS 7.
- `[settled]` 2026-09-02: the docs site is hosted on Vercel (project root `apps/docs`, Astro
  preset) at the root of its custom domain. That address is written once, as `homepage` in
  `packages/core/package.json`: `apps/docs/src/site.ts` reads it for `site` (canonical URLs,
  sitemap, og:image, llms.txt), and `task docs:readme` copies it into every README and the other
  packages' `homepage`, with `task check` failing on drift. GitHub Pages was the first assumption
  and was dropped: its `/<repo>` base path broke every asset URL on Vercel. The domain itself is
  attached in the Vercel project settings and DNS, which the repo cannot see.
- `[assumption]` Vercel's build image runs Bun 1.3.x, which cannot read the Bun 1.4 lockfile
  (`lockfileVersion: 2`). `apps/docs/vercel.json` pins the install to `bunx bun@1.4.0` from the
  repo root, Vercel's documented way; that version literal must move with `packageManager` in
  the root `package.json` until Vercel's image ships Bun 1.4.

The Taskfile is the SSOT for how anything is run; `package.json` scripts are not.

## Requirements from the issue backlog

Sourced from 92 open issues and 8 unmerged PRs across both upstream repos. Each lands with
a test and a docs page.

- Correct, shipped TypeScript types with every option optional.
- `layout: 'auto' | 'single' | 'spread'` (StPageFlip #12, react #47, #56).
- Right-to-left (StPageFlip #13, #27, #68; react #22, #26). Landed 2026-09-18 as
  `binding: "right"`; see Decisions.
- Pointer Events, `touch-action`, passive listeners; no scroll jump on flip (react #57, #58).
- Reactive options and dynamic pages without remounting (react #24, #40, #2).
- SSR-safe: nothing touches `window` at import (react #20, #46).
- Fine-grained flip triggers: edges only, disable swipe, click-through inside pages
  (StPageFlip #25, #10, #53, #29; react #30, #48).
- `destroy()` stops the render loop and restores the DOM (StPageFlip #71).
- Keyboard navigation, ARIA, `prefers-reduced-motion`.
- `[open]` Pinch zoom (StPageFlip #15). Probably post-1.0; decide when the renderer exists. A
  host's own scale already works (see the hover zoom decision), so what is open is only whether
  the library should own the gesture.
- Top and bottom binding (StPageFlip #20, PR #46). Landed 2026-09-18 as `binding: "top"` and
  `"bottom"`; see Decisions.
- `[open]` Soft cover (StPageFlip #20). Post-1.0 unless cheap.

## Phases, hardest first

Each phase is anchored to the commit that landed it; the tests named are the proof.

0. **Scaffold and prove the release path.** Landed with `0.0.1` (merge `aae36e9`, 2026-09-01).
   Bun workspace, tsdown, Biome, Vitest browser mode, Changesets, CI, publish-on-push release.
1. **Geometry kernel with parity tests.** Landed in `20ffe9f`. `packages/core/src/geometry/`,
   held to the vendored original by `packages/core/test/fold.parity.test.ts`.
2. **Headless controller, DOM renderer, input.** Landed in `e8c83d9` (renderer inline-style and
   flip-event fixes in `e183337`). `createBook` in `packages/core/src/book.ts`; look held by
   `packages/core/test/visual.parity.test.ts` against the published `page-flip@2.0.7`.
3. **React wrapper.** Landed in `f0701b8`. `packages/react/src/FlipBook.tsx`; StrictMode and
   Node SSR covered by `packages/react/test/`.
4. **Backlog features** from the list above. Landed so far: `click: "edges"` (`9056442`), the
   four bindings including right-to-left (`binding` option, `packages/core/test/binding.test.ts`),
   the hover furl, and the `flipProgress` event. Suggested order for the rest: keyboard and ARIA, then lazy images and the
   remaining click/drag option tests.
5. **Docs, migration guide, 1.0.** Not started. Before calling the packages a replacement:
   `[open]` add Firefox and WebKit to the Vitest browser instances (everything so far is verified
   in Chromium only; the original's Safari workaround was dropped on research, not a test);
   migration guide from `page-flip` / `react-pageflip` names to ours and the docs site with live
   demos are in `apps/docs` (see Docs decisions);
   `[open]` a real Next.js example app beside it.

## Deliberate differences from the original

Everything else looks and behaves the same, held by the visual parity suite
(`packages/core/test/visual.parity.test.ts`) that runs the published `page-flip@2.0.7` beside
this library. These are the places where it was wrong and we did not copy it:

- Animations always land their final frame. The original's loop skipped it, so a hovered corner
  rested a frame short of its target.
- No animation is shorter than a quarter of `flipDuration`. The original scaled duration with
  path length alone, so a hovered corner lifted and dropped in about 50ms: a snap.
- A settling corner is left to land. The original restarted the drop on every mouse move, which
  its 50ms drop hid; over a quarter second it stutters and never lands while the mouse moves.
- Drag direction and corner come from where the press started, not from the first move.
- A drag moves the fold by the pointer's travel from where it took hold, so a press in the middle
  of the edge pulled straight in furls the whole edge. The original put the corner wherever the
  pointer was, which snapped that press into a diagonal fold. The parity suite drives our drags
  by travel so the corner still lands where the original's does.
- Hovering an edge furls the whole edge, and stays furled anywhere along it, leaning toward the
  pointer. The original lifted the nearer corner and let it follow the pointer. Hover is not
  compared by the parity suite.
- Shadows default to `shadowOpacity: 0.35` and the turning page has a hairline edge
  (`.opf-page--turning` in `packages/core/src/styles.css`, coloured by `--opf-page-edge`). The
  original's full-strength shadows are a black bar on light paper, and once they are softened a
  white page over a white page loses its free edge, which no shadow ever marked. This is a look,
  not geometry: the parity suite pins ours to the original's look (`mountOurs` in
  `packages/core/test/visual/harness.ts`).
- `flipPrev` aims at the book's left edge, not the container's (StPageFlip #29 / PR #30).
- Hard pages and hard shadows are placed from the book rect, so they are right when the book is
  not flush with its container's top-left.
- A hard page's shadow is drawn only on the side that has a page to receive it. The original
  painted it on the bare stage when a cover or the lone last page opened onto the empty side or
  closed away from it. The parity scenarios for those flips leave the empty side out of the
  comparison.
- A page drawn hard for one flip (because its neighbour is hard) goes back to soft afterwards;
  the original left it hard.
- `destroy()` stops the frame loop, restores every page's inline style and class, and removes
  what was added. The original removed the caller's root element and kept looping.
- Frames are drawn only when something changes, never on a timer. Idle books cost nothing.
- `[settled]` 2026-09-01: in portrait, the current page lifts away from itself, and that needs a
  second copy of its element. The copy is a `cloneNode` like the original, but inert, without
  ids, and removed the moment the flip ends. A blank paper back was considered and rejected
  because it changes the look every portrait user knows.

## Open questions

- `[settled]` 2026-09-01: the React wrapper owns every page element. Each child of `FlipBook`
  renders inside a page `div` the wrapper controls; `<Page density style className>` is a
  marker whose props land on that element. User components need no refs or `forwardRef`. The
  wrapper re-syncs pages and redraws after every commit, so React can rewrite attributes freely.
- `[settled]` 2026-09-01: "Next.js smoke test" is a Node SSR test (`renderToString`, no
  `window`), which is the failure the upstream issues describe. A real Next.js example app
  belongs with the docs site in phase 5, not in the package's test suite.
- `[settled]` 2026-09-01: the parity oracle is the original's geometry source, vendored
  dev-only under `packages/core/test/oracle/` and run live inside the browser test next to the
  new kernel. No recorded JSON fixtures: the oracle is the single source of truth until it is
  deleted after 1.0, at which point its outputs get snapshotted.
- `[settled]` 2026-09-01: the docs app is in this repo (`apps/docs`); its examples are also the
  browser-test fixtures for the demos. See Docs decisions.

## References

- Assessment (2026-09-01): https://claude.ai/code/artifact/2d402f00-fd9e-473b-be07-40e811600cd4
- Forks worth studying (all MIT): roflsunriz/page-flip-2 (RTL, tests, WebGL curl),
  marvellousPtc/react-pageflip (React lifecycle fixes), hikashop-nicolas/flipview
  (`src/engine`: strict-null and destroy fixes as discrete commits).
