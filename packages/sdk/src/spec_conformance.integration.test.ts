/**
 * Loads the vendored `intentproof-spec` tree (sibling clone or INTENTPROOF_SPEC_ROOT) and:
 * 1) runs the same golden `execution_event` oracle as the spec repo;
 * 2) validates one real `MemoryExporter` event from this SDK through the spec harness.
 *
 * Skips if no spec checkout is present (local dev without a clone).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { IntentProofClient } from "./client.js";
import { MemoryExporter } from "./exporters/memory.js";

function resolveSpecRoot(): string | null {
  const env = process.env.INTENTPROOF_SPEC_ROOT;
  if (env && existsSync(path.join(env, "spec.json"))) {
    return path.resolve(env);
  }
  const here = fileURLToPath(new URL(".", import.meta.url));
  // packages/sdk/src -> …/intentproof-sdk-node (three levels up)
  const workspaceRoot = path.resolve(here, "../../..");
  const sibling = path.join(workspaceRoot, "../intentproof-spec");
  if (existsSync(path.join(sibling, "spec.json"))) {
    return sibling;
  }
  return null;
}

const specRootForSuite = resolveSpecRoot();

describe.skipIf(!specRootForSuite)(
  "intentproof-spec harness (vendored spec tree)",
  () => {
    const specRoot = specRootForSuite!;

    it("golden execution_event_cases.jsonl matches spec oracle", async () => {
      const mod = await import(
        pathToFileURL(path.join(specRoot, "tests/runners/sdk_test_harness.ts")).href
      );
      const { assertGoldenExecutionEventOracle } = mod as {
        assertGoldenExecutionEventOracle: () => void;
      };
      expect(() => assertGoldenExecutionEventOracle()).not.toThrow();
    });

    it("SDK-emitted ok event passes spec validateExecutionEvent", async () => {
      const mem = new MemoryExporter();
      const c = new IntentProofClient({ exporters: [mem] });
      const run = c.wrap(
        {
          intent: "SDK conformance: in-process emit check.",
          action: "conformance.harness.sdk_emit",
          captureOutput: () => null,
          captureInput: (_args: unknown[]) => ({}),
        },
        () => null,
      );
      run();
      const events = mem.getEvents();
      expect(events.length).toBe(1);
      const mod = await import(
        pathToFileURL(path.join(specRoot, "tests/runners/sdk_test_harness.ts")).href
      );
      const { validateExecutionEvent } = mod as {
        validateExecutionEvent: (v: unknown) => { ok: true } | { ok: false };
      };
      const wire = JSON.parse(JSON.stringify(events[0])) as unknown;
      const r = validateExecutionEvent(wire);
      expect(r).toEqual({ ok: true });
    });
  },
);
