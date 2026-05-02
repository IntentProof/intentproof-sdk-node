import { expect } from "vitest";
import type { ExecutionEvent } from "./types.js";

/** Test helper: collect `onExporterError` invocations; use {@link assertEmpty} when none expected. */
export function createExporterErrorSink(): {
  readonly errors: ReadonlyArray<{ error: unknown; event: ExecutionEvent }>;
  onExporterError: (error: unknown, event: ExecutionEvent) => void;
  assertEmpty: () => void;
  clear: () => void;
} {
  const errors: { error: unknown; event: ExecutionEvent }[] = [];
  return {
    get errors() {
      return errors;
    },
    onExporterError(error: unknown, event: ExecutionEvent) {
      errors.push({ error, event });
    },
    assertEmpty() {
      expect(errors, "unexpected exporter failure(s)").toEqual([]);
    },
    clear() {
      errors.length = 0;
    },
  };
}
