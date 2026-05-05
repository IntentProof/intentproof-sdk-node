import { describe, expect, it } from "vitest";
import {
  assertValidExecutionEventWire,
  validateIntentProofConfig,
  validateWrapOptions,
} from "./validators.js";

describe("schema validators (Ajv)", () => {
  it("accepts empty wrap_options document (all fields optional)", () => {
    expect(validateWrapOptions({})).toBe(true);
  });

  it("accepts minimal intentproof_config", () => {
    expect(validateIntentProofConfig({ version: 1 })).toBe(true);
  });

  it("rejects invalid execution_event payloads", () => {
    expect(() => assertValidExecutionEventWire({})).toThrow(/schema validation/);
  });
});
