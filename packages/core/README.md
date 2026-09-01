# @openpageflip/core

Framework-agnostic page-turn engine. Successor to [`page-flip`](https://www.npmjs.com/package/page-flip) (StPageFlip).

Pre-1.0 and under construction. The plan, decisions and status live in the [repository's SPEC.md](https://github.com/benhonda/openpageflip/blob/main/SPEC.md).

```sh
bun add @openpageflip/core
```

```ts
import "@openpageflip/core/styles.css";
import { Layout } from "@openpageflip/core";
```

A CDN build is published as `dist/index.iife.js` and exposes `window.OpenPageFlip`.
