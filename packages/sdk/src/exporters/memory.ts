import type { ExecutionEvent, Exporter } from "../types.js";

export interface MemoryExporterOptions {
  /** Keep at most this many recent events (default 1000). Must be a finite number >= 1. */
  maxEvents?: number;
}

/**
 * Default exporter: ring buffer in memory for debugging and tests.
 */
export class MemoryExporter implements Exporter {
  private readonly maxEvents: number;
  private readonly events: ExecutionEvent[] = [];

  constructor(options: MemoryExporterOptions = {}) {
    const cap = options.maxEvents ?? 1000;
    if (!Number.isFinite(cap) || cap < 1) {
      throw new TypeError('MemoryExporter: "maxEvents" must be a finite number >= 1');
    }
    this.maxEvents = Math.trunc(cap);
  }

  export(event: ExecutionEvent): void {
    this.events.push(event);
    const overflow = this.events.length - this.maxEvents;
    if (overflow > 0) this.events.splice(0, overflow);
  }

  /** Mutable snapshot for inspection — newest last. */
  getEvents(): readonly ExecutionEvent[] {
    return this.events;
  }

  clear(): void {
    this.events.length = 0;
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}
