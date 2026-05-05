/**
 * Public types for the SDK.
 *
 * Wire shapes (`ExecutionEvent`, `ExecutionError`, JSON `IntentProofConfig` subset) are generated from
 * `intentproof-spec` JSON Schemas — see `src/generated/`. Regenerate: `npm run generate:types -w @intentproof/sdk`.
 * `WrapOptions` adds TypeScript-only capture callbacks and snapshot options; it is not identical to the
 * JSON `wrap_options` schema (see `IntentProofWrapOptionsV1` for the schema flags).
 */
import type { IntentProofRuntimeConfigV1 } from "./generated/intentproof-config.js";
import type {
  ExecutionError,
  IntentProofExecutionEventV1,
  JsonValue,
} from "./generated/execution-event.js";
import type { IntentProofWrapOptionsV1 } from "./generated/wrap-options.js";

export type {
  JsonValue,
  IntentProofExecutionEventV1,
  ExecutionError,
  IntentProofWrapOptionsV1,
};
export type { IntentProofRuntimeConfigV1 } from "./generated/intentproof-config.js";

export type ExecutionStatus = IntentProofExecutionEventV1["status"];

/** Wire error payload — same fields as the normative `ExecutionError` object in the JSON Schema. */
export type ExecutionErrorSnapshot = Readonly<ExecutionError>;

/** One record per wrapped invocation; identical to the `execution_event` v1 schema shape. */
export type ExecutionEvent = Readonly<IntentProofExecutionEventV1>;

/**
 * Event fields built in {@link import("./client.js").IntentProofClient.wrap} before status, completion
 * time, `output`, and `error` are set. Declared with `Pick` so it stays aligned with the generated
 * wire type (avoids `Omit` on the schema’s index-signature intersection).
 */
export type ExecutionEventBase = Pick<
  IntentProofExecutionEventV1,
  "id" | "intent" | "action" | "inputs" | "startedAt"
> &
  Partial<Pick<IntentProofExecutionEventV1, "correlationId" | "attributes">>;

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

/**
 * Call-site `wrap` options. Includes snapshot tuning plus TypeScript-only `capture*` callbacks.
 * For the JSON `wrap_options` document shape (booleans, attributes, etc.), see {@link IntentProofWrapOptionsV1}.
 */
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

type SchemaConfigFields = Partial<
  Pick<
    IntentProofRuntimeConfigV1,
    "version" | "defaultWrapOptions" | "correlation" | "serialization"
  >
>;

/**
 * Runtime SDK configuration. `exporters` are live class instances; all other fields that appear in
 * `intentproof_config` JSON are taken from the generated {@link IntentProofRuntimeConfigV1} shape.
 */
export type IntentProofConfig = {
  exporters?: Exporter[];
  /** Invoked when an exporter throws synchronously or rejects. Defaults to `console.error` when unset. */
  onExporterError?: (error: unknown, event: ExecutionEvent) => void;
  /** Default attributes merged into every event (e.g. service, env). */
  defaultAttributes?: Readonly<Record<string, string | number | boolean>>;
  /**
   * When false, omit error stack traces from export payloads (default true).
   * Prefer false in production unless you operate a locked-down ingest pipeline.
   */
  includeErrorStack?: boolean;
} & SchemaConfigFields;
