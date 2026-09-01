# OpenPageFlip

> **Status: DRAFT** · 2026-09-01 · provisional
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
- `[settled]` Versions start at 0.x; 1.0.0 is tagged when parity tests and the backlog
  list below are green. Not 3.0: new scope, new API, no continuity claim.
- `[settled]` No compatibility shim for the old API. A migration guide covers renames.
- `[settled]` Contact the original author for an npm deprecation notice after 1.0 (Ben's
  call and message, not an agent's).

## Toolchain (verified 2026-09-01)

Bun workspaces + catalog · tsdown · TypeScript 7 (`strict`, `verbatimModuleSyntax`,
`isolatedDeclarations`, `erasableSyntaxOnly`) · Biome · Vitest browser mode (Playwright)
· Changesets · npm Trusted Publishing (OIDC) via `npm publish` of a `bun pm pack` tarball
· Astro Starlight + TypeDoc for docs.

- `[assumption]` tsdown is 0.x but is the successor tsup's README points at. Revisit if it
  breaks; Vite lib mode is the fallback.
- `[assumption]` `bun publish` cannot do OIDC yet (oven-sh/bun#22423). Swap the release
  step to `bun publish` when it can.

The Taskfile is the SSOT for how anything is run; `package.json` scripts are not.

## Requirements from the issue backlog

Sourced from 92 open issues and 8 unmerged PRs across both upstream repos. Each lands with
a test and a docs page.

- Correct, shipped TypeScript types with every option optional.
- `layout: 'auto' | 'single' | 'spread'` (StPageFlip #12, react #47, #56).
- `direction: 'ltr' | 'rtl'` (StPageFlip #13, #27, #68; react #22, #26).
- Pointer Events, `touch-action`, passive listeners; no scroll jump on flip (react #57, #58).
- Reactive options and dynamic pages without remounting (react #24, #40, #2).
- SSR-safe: nothing touches `window` at import (react #20, #46).
- Fine-grained flip triggers: corners only, disable swipe, click-through inside pages
  (StPageFlip #25, #10, #53, #29; react #30, #48).
- `destroy()` stops the render loop and restores the DOM (StPageFlip #71).
- Keyboard navigation, ARIA, `prefers-reduced-motion`.
- `[open]` Pinch zoom (StPageFlip #15). Probably post-1.0; decide when the renderer exists.
- `[open]` Soft cover, top/bottom binding (StPageFlip #20, PR #46). Post-1.0 unless cheap.

## Phases, hardest first

0. **Scaffold and prove the release path.** Workspace, build, lint, tests, Changesets,
   CI, release workflow. Publish `0.0.x` shells so publishing is proven before real code.
1. **Geometry kernel with parity tests.** Port the maths to strict TS with number inputs
   and result values instead of thrown errors. Run the vendored original next to it over a
   grid of drag positions and assert equality.
2. **Headless controller, DOM renderer, input.** State machine, time-based tween with
   easing, rAF only while animating, Pointer Events, ResizeObserver. Screenshot parity
   against the published original, run live in the browser test. This phase decides whether
   the rebuild holds.
3. **React wrapper.** Owned page elements (no `forwardRef` in user code), controlled and
   uncontrolled `page`, cleanup on unmount, StrictMode and Next.js smoke tests.
4. **Backlog features** from the list above.
5. **Docs, migration guide, 1.0.**

## Deliberate differences from the original

Everything else looks and behaves the same, held by the visual parity suite
(`packages/core/test/visual.parity.test.ts`) that runs the published `page-flip@2.0.7` beside
this library. These are the places where it was wrong and we did not copy it:

- Animations always land their final frame. The original's loop skipped it, so a hovered corner
  rested a frame short of its target.
- Drag direction and corner come from where the press started, not from the first move.
- `flipPrev` aims at the book's left edge, not the container's (StPageFlip #29 / PR #30).
- Hard pages and hard shadows are placed from the book rect, so they are right when the book is
  not flush with its container's top-left.
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
- `[open]` Docs app in this repo (`apps/docs`) or a separate repo? Leaning in-repo, since
  it doubles as the browser-test fixture host.

## References

- Assessment (2026-09-01): https://claude.ai/code/artifact/2d402f00-fd9e-473b-be07-40e811600cd4
- Forks worth studying (all MIT): roflsunriz/page-flip-2 (RTL, tests, WebGL curl),
  marvellousPtc/react-pageflip (React lifecycle fixes), hikashop-nicolas/flipview
  (`src/engine`: strict-null and destroy fixes as discrete commits).
