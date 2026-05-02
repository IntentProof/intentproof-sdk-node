import type { ExecutionEvent, Exporter } from "../types.js";
import { describeValueType } from "../runtime.js";

/** Last-resort wire body when custom `body` and `safeJsonEnvelope` both fail. */
const HTTP_EXPORTER_FALLBACK_BODY =
  '{"intentproof":"1","eventSerializeFailed":true}' as const;

/** JSON body for the default wire shape; never throws (last resort is a static envelope). */
function safeJsonEnvelope(event: ExecutionEvent): string {
  try {
    return JSON.stringify({ intentproof: "1", event });
  } catch {
    try {
      return JSON.stringify({
        intentproof: "1",
        eventPartial: {
          id: event.id,
          action: event.action,
          intent: event.intent,
          status: event.status,
          correlationId: event.correlationId,
          startedAt: event.startedAt,
          completedAt: event.completedAt,
          durationMs: event.durationMs,
        },
        note: "full event not JSON-serializable",
      });
    } catch {
      return HTTP_EXPORTER_FALLBACK_BODY;
    }
  }
}

export interface HttpExporterOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Serialize event for wire format (default JSON body). */
  body?: (event: ExecutionEvent) => string;
  /**
   * When true, await each request (blocks until HTTP completes). Default false.
   */
  awaitEach?: boolean;
  /** Abort the request after this many milliseconds (global `AbortSignal.timeout`). */
  timeoutMs?: number;
  onError?: (error: unknown, event: ExecutionEvent) => void;
}

/**
 * POST execution events as JSON. Uses global `fetch` (Node 18+).
 * Fire-and-forget by default to avoid slowing callers.
 */
export class HttpExporter implements Exporter {
  private readonly url: string;
  private readonly method: string;
  private readonly headers: Record<string, string>;
  private readonly body: (event: ExecutionEvent) => string;
  private readonly awaitEach: boolean;
  private readonly timeoutMs?: number;
  private readonly onError?: (error: unknown, event: ExecutionEvent) => void;
  private readonly inFlight = new Set<Promise<void>>();
  private closed = false;

  constructor(options: HttpExporterOptions) {
    if (typeof options.url !== "string") {
      throw new TypeError(
        `HttpExporter: "url" must be a non-empty string, got ${describeValueType(options.url)}`,
      );
    }
    if (options.url.trim().length === 0) {
      throw new TypeError(
        'HttpExporter: "url" must be a non-empty string (trimmed length is 0)',
      );
    }
    this.url = options.url;
    this.method = (options.method ?? "POST").trim() || "POST";
    const rawHeaders = options.headers;
    const extraHeaders =
      rawHeaders !== undefined &&
      rawHeaders !== null &&
      typeof rawHeaders === "object" &&
      !Array.isArray(rawHeaders)
        ? (rawHeaders as Record<string, string>)
        : {};
    this.headers = {
      "content-type": "application/json",
      ...extraHeaders,
    };
    this.body = options.body ?? ((event: ExecutionEvent) => safeJsonEnvelope(event));
    this.awaitEach = options.awaitEach ?? false;
    if (options.timeoutMs !== undefined) {
      const t = options.timeoutMs;
      if (!Number.isFinite(t) || t <= 0) {
        throw new TypeError(
          'HttpExporter: "timeoutMs" must be a finite number > 0 when set',
        );
      }
      this.timeoutMs = Math.trunc(t);
    } else {
      this.timeoutMs = undefined;
    }
    this.onError = options.onError;
  }

  private track(p: Promise<void>): void {
    this.inFlight.add(p);
    void p.finally(() => this.inFlight.delete(p));
  }

  export(event: ExecutionEvent): void | Promise<void> {
    if (this.closed) {
      this.onError?.(new Error("HttpExporter has been shut down"), event);
      return;
    }

    let payload: string;
    try {
      payload = this.body(event);
    } catch (e) {
      this.onError?.(e, event);
      payload = safeJsonEnvelope(event);
    }

    const run = async (): Promise<void> => {
      try {
        const res = await fetch(this.url, {
          method: this.method,
          headers: this.headers,
          body: payload,
          credentials: "omit",
          signal:
            this.timeoutMs !== undefined
              ? AbortSignal.timeout(this.timeoutMs)
              : undefined,
        });
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}: ${res.statusText}`);
          this.onError?.(err, event);
        }
      } catch (e) {
        this.onError?.(e, event);
      }
    };

    const p = run();
    this.track(p);
    if (this.awaitEach) return p;
    void p;
  }

  /** Waits until every started request has settled (success or failure). */
  flush(): Promise<void> {
    if (this.inFlight.size === 0) return Promise.resolve();
    return Promise.all([...this.inFlight]).then(() => {});
  }

  /** Stops accepting new events and waits for in-flight requests to finish. */
  async shutdown(): Promise<void> {
    this.closed = true;
    await this.flush();
  }
}
