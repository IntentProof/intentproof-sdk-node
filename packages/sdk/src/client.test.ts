/**
 * IntentProofClient: validation, correlation, wrap/capture, exporter dispatch, lifecycle.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  MemoryExporter,
  assertCorrelationId,
  assertWrapOptionsShape,
  createIntentProofClient,
  getCorrelationId,
  getIntentProofClient,
  runWithCorrelationId,
} from "./index.js";
import { IntentProofClient } from "./client.js";
import { createExporterErrorSink } from "./exporters.test-helpers.js";
import type { Exporter, WrapOptions } from "./types.js";

describe("sdk: package metadata", () => {
  it("exposes VERSION matching package.json", async () => {
    const { VERSION } = await import("./index.js");
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(VERSION).toBe(pkg.version);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("returns one shared default client instance", () => {
    expect(getIntentProofClient()).toBe(getIntentProofClient());
  });
});

describe("sdk: IntentProofClient validation", () => {
  const v = createIntentProofClient({ exporters: [] });

  it("rejects wrap when fn is not a function", () => {
    expect(() =>
      v.wrap({ intent: "i", action: "math.add" }, null as unknown as () => void),
    ).toThrow(/wrap\(\) second argument must be a function/);
  });

  it("rejects invalid intent, action, and correlationId types and blanks", () => {
    expect(() =>
      v.wrap({ intent: "x", action: 123 } as unknown as WrapOptions, () => {}),
    ).toThrow(/"action" must be a string/);

    expect(() =>
      v.wrap({ intent: null, action: "math.add" } as unknown as WrapOptions, () => {}),
    ).toThrow(/"intent" must be a string/);

    expect(() =>
      v.wrap(
        {
          intent: "x",
          action: "math.add",
          correlationId: 1,
        } as unknown as WrapOptions,
        () => {},
      ),
    ).toThrow(/"correlationId" must be a string/);

    expect(() =>
      v.wrap({ intent: "", action: "math.add" } as WrapOptions, () => {}),
    ).toThrow(/"intent" must be a non-empty string/);

    expect(() =>
      v.wrap({ intent: "   ", action: "math.add" } as WrapOptions, () => {}),
    ).toThrow(/"intent" must be a non-empty string/);

    expect(() =>
      v.wrap({ intent: "ok intent", action: "" } as WrapOptions, () => {}),
    ).toThrow(/"action" must be a non-empty string/);

    expect(() =>
      v.wrap(
        {
          intent: "ok intent",
          action: "math.add",
          correlationId: "",
        } as WrapOptions,
        () => {},
      ),
    ).toThrow(/"correlationId" must be a non-empty string/);

    expect(() =>
      v.wrap(
        {
          intent: "ok intent",
          action: "math.add",
          correlationId: "\t  ",
        } as WrapOptions,
        () => {},
      ),
    ).toThrow(/"correlationId" must be a non-empty string/);
  });

  it("rejects non-boolean includeErrorStack on wrap options", () => {
    expect(() =>
      assertWrapOptionsShape({
        intent: "i",
        action: "a",
        includeErrorStack: 1 as unknown as boolean,
      }),
    ).toThrow(/"includeErrorStack" must be a boolean/);
  });

  it("rejects configure when onExporterError is not a function", () => {
    const c = createIntentProofClient({ exporters: [] });
    expect(() =>
      c.configure({
        onExporterError: "nope" as unknown as (e: unknown) => void,
      }),
    ).toThrow(/onExporterError must be a function/);
  });

  it("rejects configure when includeErrorStack is not boolean", () => {
    const c = createIntentProofClient({ exporters: [] });
    expect(() =>
      c.configure({
        includeErrorStack: 0 as unknown as boolean,
      }),
    ).toThrow(/includeErrorStack must be a boolean/);
  });

  it("rejects invalid defaultAttributes", () => {
    const c = createIntentProofClient({ exporters: [] });
    expect(() =>
      c.configure({
        defaultAttributes: [] as unknown as Record<string, string>,
      }),
    ).toThrow(/defaultAttributes must be a plain object/);
    expect(() =>
      c.configure({
        defaultAttributes: { bad: null as unknown as string },
      }),
    ).toThrow(/defaultAttributes\["bad"\]/);
  });

  it("rejects exporter entries without export()", () => {
    const c = createIntentProofClient({ exporters: [] });
    expect(() =>
      c.configure({
        exporters: [{} as unknown as Exporter],
      }),
    ).toThrow(/exporters\[0\].*export\(\)/);

    expect(
      () =>
        new IntentProofClient({
          exporters: [null as unknown as Exporter],
        }),
    ).toThrow(/exporters\[0\].*export\(\)/);
  });
});

describe("sdk: correlation and validators", () => {
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it("exposes correlation id inside runWithCorrelationId", () => {
    runWithCorrelationId("c1", () => {
      expect(getCorrelationId()).toBe("c1");
    });
  });

  it("rejects runWithCorrelationId without fn or with invalid id", () => {
    expect(() => (runWithCorrelationId as (id: string) => void)("orphan-id")).toThrow(
      /expected runWithCorrelationId\(correlationId, fn\)/,
    );

    expect(() => runWithCorrelationId(null as unknown as string, () => {})).toThrow(
      /"correlationId" must be a string/,
    );
    expect(() => runWithCorrelationId("", () => {})).toThrow(
      /"correlationId" must be a non-empty string/,
    );
    expect(() => runWithCorrelationId(" \t\n", () => {})).toThrow(
      /"correlationId" must be a non-empty string/,
    );
    expect(() => runWithCorrelationId(1 as unknown as string, () => {})).toThrow(
      /"correlationId" must be a string/,
    );
  });

  it("withCorrelation(fn) generates a UUID; withCorrelation(id, fn) uses inbound id or UUID when blank", () => {
    const sink = createExporterErrorSink();
    const v = createIntentProofClient({ onExporterError: sink.onExporterError });
    let seen: string | undefined;
    v.withCorrelation(() => {
      seen = v.getCorrelationId();
    });
    expect(seen).toMatch(uuidRe);

    v.withCorrelation("inbound-req-9", () => {
      expect(v.getCorrelationId()).toBe("inbound-req-9");
    });

    let a: string | undefined;
    v.withCorrelation("", () => {
      a = v.getCorrelationId();
    });
    let b: string | undefined;
    v.withCorrelation(" \t\n", () => {
      b = v.getCorrelationId();
    });
    expect(a).toMatch(uuidRe);
    expect(b).toMatch(uuidRe);
    expect(a).not.toBe(b);

    expect(() =>
      (v as unknown as { withCorrelation(id: string): void }).withCorrelation("orphan"),
    ).toThrow(/expected withCorrelation\(fn\) or withCorrelation\(correlationId, fn\)/);

    expect(() => v.withCorrelation(1 as unknown as string, () => {})).toThrow(
      /correlation id must be a string/,
    );

    sink.assertEmpty();
  });

  it("assertCorrelationId and assertWrapOptionsShape surface value kinds", () => {
    expect(() => assertCorrelationId(null)).toThrow(/got null/);
    expect(() => assertCorrelationId([] as unknown as string)).toThrow(/got array/);

    expect(() =>
      assertWrapOptionsShape({
        intent: [] as unknown as string,
        action: "math.add",
      }),
    ).toThrow(/"intent" must be a string, got array/);

    expect(() =>
      assertWrapOptionsShape({
        intent: "i",
        action: "math.add",
        attributes: [] as unknown as Record<string, string>,
      }),
    ).toThrow(/WrapOptions\.attributes must be a plain object/);
    expect(() =>
      assertWrapOptionsShape({
        intent: "i",
        action: "math.add",
        attributes: { x: null as unknown as string },
      }),
    ).toThrow(/WrapOptions\.attributes\["x"\]/);
  });
});

describe("sdk: wrap, capture policy, and dispatch", () => {
  it("records sync/async outcomes, correlation, capture fallbacks, and error stacks", async () => {
    const memory = new MemoryExporter();
    const sink = createExporterErrorSink();
    const v = createIntentProofClient({
      exporters: [memory],
      onExporterError: sink.onExporterError,
    });

    const add = v.wrap(
      {
        intent: "Add two numbers for billing",
        action: "math.add",
        captureInput: (args) => ({ a: args[0], b: args[1] }),
      },
      (a: number, b: number) => a + b,
    );
    expect(runWithCorrelationId("req-abc", () => add(2, 3))).toBe(5);
    const e0 = memory.getEvents()[0]!;
    expect(e0.status).toBe("ok");
    expect(e0.correlationId).toBe("req-abc");
    expect(e0.inputs).toEqual({ a: 2, b: 3 });
    expect(e0.output).toBe(5);

    memory.clear();

    const boom = v.wrap({ intent: "May throw", action: "test.boom" }, () => {
      throw new Error("nope");
    });
    expect(() => boom()).toThrow("nope");
    expect(memory.getEvents()[0]!.status).toBe("error");

    memory.clear();

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const fetchUser = v.wrap(
      { intent: "Load user by id", action: "db.user.get" },
      async (id: string) => {
        await sleep(1);
        return { id, name: "Ada" };
      },
    );
    await runWithCorrelationId("trace-1", () => fetchUser("u1"));
    expect(memory.getEvents()[0]!.correlationId).toBe("trace-1");

    memory.clear();

    const fail = v.wrap(
      { intent: "Failing op", action: "test.asyncFail" },
      async () => {
        throw new Error("async nope");
      },
    );
    await expect(fail()).rejects.toThrow("async nope");
    expect(memory.getEvents()[0]!.status).toBe("error");

    memory.clear();

    const vNoStack = createIntentProofClient({
      exporters: [memory],
      includeErrorStack: false,
      onExporterError: sink.onExporterError,
    });
    const errNoStack = vNoStack.wrap({ intent: "x", action: "test.err" }, () => {
      throw new Error("fail");
    });
    expect(() => errNoStack()).toThrow("fail");
    expect(memory.getEvents()[0]!.error?.stack).toBeUndefined();

    memory.clear();

    const vPerWrap = createIntentProofClient({
      exporters: [memory],
      includeErrorStack: false,
      onExporterError: sink.onExporterError,
    });
    const errStack = vPerWrap.wrap(
      {
        intent: "x",
        action: "test.err2",
        includeErrorStack: true,
      },
      () => {
        throw new Error("e");
      },
    );
    expect(() => errStack()).toThrow("e");
    expect(memory.getEvents()[0]!.error?.stack).toBeDefined();

    memory.clear();

    const capIn = v.wrap(
      {
        intent: "x",
        action: "test.captureInputThrow",
        captureInput: () => {
          throw new Error("bad capture");
        },
      },
      (n: number) => n + 1,
    );
    expect(capIn(1)).toBe(2);
    expect(memory.getEvents()[0]!.inputs).toEqual([1]);

    memory.clear();

    const capOut = v.wrap(
      {
        intent: "o",
        action: "math.add2",
        captureOutput: () => {
          throw new Error("cap out");
        },
      },
      () => ({ x: 1 }),
    );
    expect(capOut()).toEqual({ x: 1 });
    expect(memory.getEvents()[0]!.output).toEqual({ x: 1 });

    memory.clear();

    const capErr = v.wrap(
      {
        intent: "o",
        action: "test.err3",
        captureError: () => {
          throw new Error("cap err");
        },
      },
      () => {
        throw new Error("boom");
      },
    );
    expect(() => capErr()).toThrow("boom");
    expect(memory.getEvents()[0]!.output).toBeUndefined();

    memory.clear();

    const weird = v.wrap({ intent: "x", action: "test.boomObj" }, () => {
      throw { code: 418 } as unknown;
    });
    expect(() => weird()).toThrow();
    expect(memory.getEvents()[0]!.error?.message).toBe("[object Object]");

    sink.assertEmpty();
  });

  it("merge default and per-call attributes on wrapped calls", () => {
    const memory = new MemoryExporter();
    const sink = createExporterErrorSink();
    const v = createIntentProofClient({
      exporters: [memory],
      defaultAttributes: { service: "api", env: "test" },
      onExporterError: sink.onExporterError,
    });
    const mul = v.wrap({ intent: "t", action: "math.mul" }, (x: number) => x * 2);
    expect(mul(3)).toBe(6);
    expect(memory.getEvents()[0]!.output).toBe(6);

    memory.clear();
    const noop = v.wrap(
      {
        intent: "m",
        action: "math.add3",
        attributes: { route: "/v1" },
      },
      () => null,
    );
    noop();
    expect(memory.getEvents()[0]!.attributes).toEqual({
      service: "api",
      env: "test",
      route: "/v1",
    });

    sink.assertEmpty();
  });

  it("configure replaces exporters list while merging other fields", () => {
    const m1 = new MemoryExporter();
    const m2 = new MemoryExporter();
    const c = new IntentProofClient({ exporters: [m1] });
    c.configure({
      exporters: [m2],
      defaultAttributes: { v: 1 },
    });
    c.wrap({ intent: "c", action: "test.boom" }, () => 0)();
    expect(m2.getEvents()).toHaveLength(1);
    expect(m1.getEvents()).toHaveLength(0);
  });

  it("routes exporter failures to onExporterError without failing the wrapped call", async () => {
    const sink = createExporterErrorSink();
    const syncBad: Exporter = {
      export() {
        throw new Error("sync export");
      },
    };
    createIntentProofClient({
      exporters: [syncBad],
      onExporterError: sink.onExporterError,
    }).wrap({ intent: "i", action: "math.add" }, () => 1)();
    expect(sink.errors).toHaveLength(1);
    expect(sink.errors[0]!.error).toMatchObject({ message: "sync export" });
    sink.clear();

    const asyncBad: Exporter = {
      export() {
        return Promise.reject(new Error("async export"));
      },
    };
    createIntentProofClient({
      exporters: [asyncBad],
      onExporterError: sink.onExporterError,
    }).wrap({ intent: "i", action: "math.add" }, () => 1)();
    await new Promise((r) => setTimeout(r, 0));
    expect(sink.errors.length).toBeGreaterThanOrEqual(1);
    expect(String(sink.errors[0]!.error)).toContain("async export");
    sink.clear();

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    createIntentProofClient({
      exporters: [
        {
          export() {
            throw new Error("boom");
          },
        },
      ],
    }).wrap({ intent: "x", action: "math.add" }, () => 1)();
    expect(spy).toHaveBeenCalledWith(
      "[intentproof] exporter error",
      expect.objectContaining({ message: "boom" }),
    );
    spy.mockRestore();
  });
});

describe("sdk: flush and shutdown", () => {
  it("awaits optional hooks and tolerates exporters without them", async () => {
    const sink = createExporterErrorSink();
    const bare = createIntentProofClient({
      exporters: [{ export() {} }],
      onExporterError: sink.onExporterError,
    });
    await bare.flush();
    await expect(bare.shutdown()).resolves.toBeUndefined();

    let flushed = false;
    const exFlush: Exporter = {
      export() {},
      flush() {
        flushed = true;
      },
    };
    await createIntentProofClient({
      exporters: [exFlush],
      onExporterError: sink.onExporterError,
    }).flush();
    expect(flushed).toBe(true);

    let shutdownCalled = false;
    const exShut: Exporter = {
      export() {},
      async shutdown() {
        shutdownCalled = true;
      },
    };
    await createIntentProofClient({
      exporters: [exShut],
      onExporterError: sink.onExporterError,
    }).shutdown();
    expect(shutdownCalled).toBe(true);

    let flushedViaShutdown = 0;
    const exFallback: Exporter = {
      export() {},
      flush() {
        flushedViaShutdown++;
      },
    };
    await createIntentProofClient({
      exporters: [exFallback],
      onExporterError: sink.onExporterError,
    }).shutdown();
    expect(flushedViaShutdown).toBeGreaterThanOrEqual(1);

    sink.assertEmpty();
  });
});
