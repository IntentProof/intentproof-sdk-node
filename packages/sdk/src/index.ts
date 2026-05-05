/**
 * @packageDocumentation
 * Structured `ExecutionEvent` emission for verification / ingest pipelines.
 */

import { IntentProofClient, getIntentProofClient } from "./client.js";
import type { IntentProofConfig } from "./types.js";

/** Injected at build (`tsup`) and test (`vitest`) time from `package.json` — single source of truth. */
declare const __INTENTPROOF_SDK_VERSION__: string;

export const VERSION = __INTENTPROOF_SDK_VERSION__;

export type {
  ExecutionError,
  ExecutionErrorSnapshot,
  ExecutionEvent,
  ExecutionEventBase,
  ExecutionStatus,
  Exporter,
  IntentProofConfig,
  IntentProofExecutionEventV1,
  IntentProofRuntimeConfigV1,
  IntentProofWrapOptionsV1,
  JsonValue,
  SerializeOptions,
  WrapOptions,
} from "./types.js";

export { snapshot } from "./snapshot.js";

export { MemoryExporter } from "./exporters/memory.js";
export type { MemoryExporterOptions } from "./exporters/memory.js";

export { HttpExporter } from "./exporters/http.js";
export type { HttpExporterOptions } from "./exporters/http.js";

export { BoundedQueueExporter } from "./exporters/queue.js";
export type {
  BoundedQueueExporterOptions,
  QueueOverflowStrategy,
} from "./exporters/queue.js";

export {
  IntentProofClient,
  assertCorrelationId,
  assertWrapOptionsShape,
  getCorrelationId,
  getIntentProofClient,
  runWithCorrelationId,
} from "./client.js";

export {
  assertValidExecutionEventWire,
  validateExecutionEvent,
  validateIntentProofConfig,
  validateWrapOptions,
} from "./validators.js";

/** Default singleton — same instance as `getIntentProofClient()`. */
export const client = getIntentProofClient();

/** Isolated client instance (tests, workers, per-tenant configuration). */
export function createIntentProofClient(config?: IntentProofConfig): IntentProofClient {
  return new IntentProofClient(config);
}
