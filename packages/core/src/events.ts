export type Listener<T> = (event: T) => void;

export type Emitter<Events extends Record<string, unknown>> = {
  on<K extends keyof Events>(
    name: K,
    listener: Listener<Events[K]>,
    options?: { signal?: AbortSignal },
  ): () => void;
  off<K extends keyof Events>(name: K, listener: Listener<Events[K]>): void;
  emit<K extends keyof Events>(name: K, event: Events[K]): void;
  clear(): void;
};

/** Minimal typed event emitter. `on` returns the unsubscribe function. */
export function createEmitter<Events extends Record<string, unknown>>(): Emitter<Events> {
  const listeners = new Map<keyof Events, Set<Listener<never>>>();

  const off: Emitter<Events>["off"] = (name, listener) => {
    listeners.get(name)?.delete(listener as Listener<never>);
  };

  return {
    on(name, listener, options) {
      let set = listeners.get(name);
      if (set === undefined) {
        set = new Set();
        listeners.set(name, set);
      }
      set.add(listener as Listener<never>);
      const unsubscribe = () => off(name, listener);
      options?.signal?.addEventListener("abort", unsubscribe, { once: true });
      return unsubscribe;
    },
    off,
    emit(name, event) {
      const set = listeners.get(name);
      if (set === undefined) return;
      for (const listener of [...set]) (listener as Listener<typeof event>)(event);
    },
    clear() {
      listeners.clear();
    },
  };
}
