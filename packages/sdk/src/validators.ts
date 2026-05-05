/**
 * Runtime JSON Schema validation using Ajv (compiled from normative spec schemas in `generated/embed/`).
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import type { Plugin } from "ajv";
import * as AjvFormats from "ajv-formats";
import executionEventSchema from "./generated/embed/execution-event.v1.js";
import intentproofConfigSchema from "./generated/embed/intentproof-config.v1.js";
import wrapOptionsSchema from "./generated/embed/wrap-options.v1.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});
const addFormats = AjvFormats.default as unknown as Plugin<unknown>;
addFormats(ajv);

/** Compiled validator for `execution_event` v1 (wire / export shape, camelCase keys). */
export const validateExecutionEvent: ValidateFunction = ajv.compile(
  executionEventSchema as object,
);

/** Compiled validator for `wrap_options` v1. */
export const validateWrapOptions: ValidateFunction = ajv.compile(
  wrapOptionsSchema as object,
);

/** Compiled validator for `intentproof_config` v1 (runtime JSON document subset). */
export const validateIntentProofConfig: ValidateFunction = ajv.compile(
  intentproofConfigSchema as object,
);

function errorsText(v: ValidateFunction): string {
  return ajv.errorsText(v.errors, { separator: "; " });
}

/**
 * Ensures an execution record matches the pinned `execution_event` schema (throws on failure).
 */
export function assertValidExecutionEventWire(data: unknown): void {
  if (!validateExecutionEvent(data)) {
    throw new TypeError(
      `ExecutionEvent wire JSON failed schema validation: ${errorsText(validateExecutionEvent)}`,
    );
  }
}
