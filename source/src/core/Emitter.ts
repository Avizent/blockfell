/** Minimal typed event emitter. */
export class Emitter<Events extends Record<string, unknown>> {
  private handlers: { [K in keyof Events]?: Set<(e: Events[K]) => void> } = {};

  on<K extends keyof Events>(type: K, fn: (e: Events[K]) => void): () => void {
    (this.handlers[type] ??= new Set()).add(fn);
    return () => this.handlers[type]?.delete(fn);
  }

  emit<K extends keyof Events>(type: K, e: Events[K]): void {
    const set = this.handlers[type];
    if (set) for (const fn of set) fn(e);
  }

  clear(): void {
    this.handlers = {};
  }
}
