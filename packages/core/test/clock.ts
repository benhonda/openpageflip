import type { Clock } from "../src/animation.ts";

/** A clock that only moves when a test says so. */
export function createManualClock(): {
  clock: Clock;
  advance(ms: number): void;
  pending(): number;
} {
  let time = 0;
  let next = 1;
  const frames = new Map<number, (t: number) => void>();
  return {
    clock: {
      now: () => time,
      requestFrame: (callback) => {
        const handle = next++;
        frames.set(handle, callback);
        return handle;
      },
      cancelFrame: (handle) => {
        frames.delete(handle);
      },
    },
    advance(ms) {
      time += ms;
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback(time);
    },
    pending: () => frames.size,
  };
}
