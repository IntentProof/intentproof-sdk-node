/** Wire shape for emitted execution records (verification / ingest). */

export type ExecutionStatus = "ok" | "error";

export interface ExecutionErrorSnapshot {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

/** One record per wrapped invocation — stable fields for a verifier to consume. */
export interface ExecutionEvent {
  readonly id: string;
  readonly correlationId?: string;
  readonly intent: string;
  readonly action: string;
  readonly inputs: unknown;
  readonly output?: unknown;
  readonly error?: ExecutionErrorSnapshot;
  readonly status: ExecutionStatus;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface Exporter {
  /** Must not throw synchronously; async exporters may return a Promise. */
  export(event: ExecutionEvent): void | Promise<void>;
  /** Wait until async side-effects are idle (optional). */
  flush?(): void | Promise<void>;
  /** Stop accepting work and drain (optional). */
  shutdown?(): void | Promise<void>;
}

export interface SerializeOptions {
  /** Max object nesting when snapshotting (default 6). */
  maxDepth?: number;
  /** Max enumerable own keys per object (default 50). */
  maxKeys?: number;
  /**
   * Own-property keys to replace with `[REDACTED]` (case-insensitive exact match).
   * Nested objects are walked recursively.
   */
  redactKeys?: string[];
  /** Truncate string primitives longer than this (default unlimited). */
  maxStringLength?: number;
}

export interface WrapOptions extends SerializeOptions {
  /** Non-empty after trim; enforced at runtime in {@link import("./client.js").assertWrapOptionsShape}. */
  intent: string;
  /** Non-empty after trim; enforced at runtime in {@link import("./client.js").assertWrapOptionsShape}. */
  action: string;
  /** Non-empty after trim when set; enforced at runtime. Otherwise uses active context. */
  correlationId?: string;
  /** Extra dimensions on the emitted event. */
  attributes?: Readonly<Record<string, string | number | boolean>>;
  captureInput?: (args: unknown[]) => unknown;
  captureOutput?: (result: unknown) => unknown;
  captureError?: (error: unknown) => unknown;
  /**
   * When false, omit `error.stack` from recorded failures (reduces path/log leakage).
   * Overrides {@link IntentProofConfig.includeErrorStack} for this wrap only.
   */
  includeErrorStack?: boolean;
}

export interface IntentProofConfig {
  exporters?: Exporter[];
  /** Invoked if an exporter throws synchronously or rejects. Defaults to `console.error` when unset. */
  onExporterError?: (error: unknown, event: ExecutionEvent) => void;
  /** Default attributes merged into every event (e.g. service, env). */
  defaultAttributes?: Readonly<Record<string, string | number | boolean>>;
  /**
   * When false, omit error stack traces from export payloads (default true).
   * Prefer false in production unless you operate a locked-down ingest pipeline.
   */
  includeErrorStack?: boolean;
}
