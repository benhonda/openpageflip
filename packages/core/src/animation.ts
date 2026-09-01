/** Time and frame sources, injectable so tests can step animations by hand. */
export type Clock = {
  now(): number;
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(handle: number): void;
};

export const browserClock: Clock = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};

export type Tween = {
  /** Jump to the end and run the completion callback. */
  finish(): void;
  /** Stop without completing. */
  cancel(): void;
};

export type TweenSpec = {
  readonly duration: number;
  readonly easing: (t: number) => number;
  /** Called with eased progress 0..1 once per frame, and once with 1 on finish. */
  readonly onFrame: (progress: number) => void;
  readonly onEnd: () => void;
};

/** A single time-based animation. Frames are requested only while it runs. */
export function startTween(clock: Clock, spec: TweenSpec): Tween {
  const startedAt = clock.now();
  let handle: number | null = null;
  let done = false;

  const end = (): void => {
    if (done) return;
    done = true;
    if (handle !== null) clock.cancelFrame(handle);
    handle = null;
    spec.onFrame(1);
    spec.onEnd();
  };

  const tick = (time: number): void => {
    handle = null;
    if (done) return;
    const t = spec.duration <= 0 ? 1 : Math.min(1, (time - startedAt) / spec.duration);
    if (t >= 1) {
      end();
      return;
    }
    spec.onFrame(spec.easing(t));
    handle = clock.requestFrame(tick);
  };

  if (spec.duration <= 0) {
    end();
  } else {
    handle = clock.requestFrame(tick);
  }

  return {
    finish: end,
    cancel: () => {
      done = true;
      if (handle !== null) clock.cancelFrame(handle);
      handle = null;
    },
  };
}
