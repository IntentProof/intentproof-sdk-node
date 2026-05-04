import type { ExecutionEvent, Exporter } from "../types.js";
import { isPromiseLike } from "../runtime.js";

export type QueueOverflowStrategy = "drop-newest" | "drop-oldest";

export interface BoundedQueueExporterOptions {
  /** Downstream exporter (often {@link import("./http.js").HttpExporter}). */
  exporter: Exporter;
  /** Maximum concurrent async exports to the inner exporter (default `4`). */
  maxConcurrent?: number;
  /**
   * Maximum **queued** events waiting for a worker slot (default `1000`).
   * Use `0` for unlimited backlog (not recommended under sustained overload).
   */
  maxQueue?: number;
  /** How to handle overflow when the queue is full (default `drop-newest`). */
  strategy?: QueueOverflowStrategy;
  onDrop?: (event: ExecutionEvent, reason: string) => void;
  onInnerError?: (error: unknown, event: ExecutionEvent) => void;
}

/**
 * Bounded concurrency + backlog for async-heavy exporters.
 * Sync inner exporters run on the microtask queue and still respect {@link maxConcurrent}.
 */
export class BoundedQueueExporter implements Exporter {
  private readonly inner: Exporter;
  private readonly maxConcurrent: number;
  private readonly maxQueue: number;
  private readonly strategy: QueueOverflowStrategy;
  private readonly onDrop?: (event: ExecutionEvent, reason: string) => void;
  private readonly onInnerError?: (error: unknown, event: ExecutionEvent) => void;

  private readonly queue: ExecutionEvent[] = [];
  private active = 0;
  /** When false, {@link export} drops events with reason `shutdown`; queued work still drains. */
  private accepting = true;
  private idleResolvers: Array<() => void> = [];

  constructor(options: BoundedQueueExporterOptions) {
    const inner = options.exporter;
    if (
      inner == null ||
      typeof inner !== "object" ||
      typeof inner.export !== "function"
    ) {
      throw new TypeError(
        'BoundedQueueExporter: "exporter" must be an object with an export() method',
      );
    }
    this.inner = inner;
    const rawMc = options.maxConcurrent ?? 4;
    this.maxConcurrent = !Number.isFinite(rawMc) ? 4 : Math.max(1, Math.trunc(rawMc));
    const rawQ = options.maxQueue ?? 1000;
    if (!Number.isFinite(rawQ)) {
      this.maxQueue = 1000;
    } else {
      const q = Math.trunc(rawQ);
      if (q === 0) {
        this.maxQueue = 0;
      } else if (q < 0) {
        this.maxQueue = 1000;
      } else {
        this.maxQueue = q;
      }
    }
    const strategy = options.strategy ?? "drop-newest";
    if (strategy !== "drop-newest" && strategy !== "drop-oldest") {
      throw new TypeError(
        'BoundedQueueExporter: "strategy" must be "drop-newest" or "drop-oldest"',
      );
    }
    this.strategy = strategy;
    this.onDrop = options.onDrop;
    this.onInnerError = options.onInnerError;
  }

  export(event: ExecutionEvent): void {
    if (!this.accepting) {
      this.onDrop?.(event, "shutdown");
      return;
    }

    const cap = this.maxQueue <= 0 ? Number.POSITIVE_INFINITY : this.maxQueue;

    if (this.queue.length >= cap) {
      if (this.strategy === "drop-oldest") {
        // `length >= cap` and finite cap imply a non-empty queue before push.
        const dropped = this.queue.shift()!;
        this.onDrop?.(dropped, "queue-overflow-drop-oldest");
        this.queue.push(event);
      } else {
        this.onDrop?.(event, "queue-overflow-drop-newest");
      }
      this.pump();
      return;
    }

    this.queue.push(event);
    this.pump();
  }

  private pump(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.active++;
      void this.runInner(next).finally(() => {
        this.active--;
        this.pump();
        this.resolveIdleWaitersIfNeeded();
      });
    }
  }

  private async runInner(event: ExecutionEvent): Promise<void> {
    try {
      const r = this.inner.export(event);
      if (isPromiseLike(r)) await r;
    } catch (e) {
      this.onInnerError?.(e, event);
    }
  }

  private resolveIdleWaitersIfNeeded(): void {
    if (this.queue.length === 0 && this.active === 0) {
      const waiters = this.idleResolvers;
      this.idleResolvers = [];
      for (const r of waiters) r();
    }
  }

  /** Resolves when the queue is empty and no inner export is in flight. */
  flush(): Promise<void> {
    if (this.queue.length === 0 && this.active === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  /**
   * Stops accepting new events; does **not** drop items already in the queue—
   * {@link flush} waits until queued and in-flight work finishes.
   */
  async shutdown(): Promise<void> {
    this.accepting = false;
    await this.flush();
  }
}
