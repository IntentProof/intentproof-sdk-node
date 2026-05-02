/** Memory, HTTP, and bounded-queue exporters (delivery path). */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BoundedQueueExporter,
  HttpExporter,
  MemoryExporter,
  createIntentProofClient,
} from "./index.js";
import { createExporterErrorSink } from "./exporters.test-helpers.js";
import type { ExecutionEvent, Exporter } from "./types.js";

function testEvent(overrides: Partial<ExecutionEvent> = {}): ExecutionEvent {
  const t = new Date().toISOString();
  return {
    id: "ev-u",
    intent: "unit",
    action: "math.add",
    inputs: {},
    status: "ok",
    startedAt: t,
    completedAt: t,
    durationMs: 0,
    ...overrides,
  };
}
function testEventByAction(action: string): ExecutionEvent {
  return testEvent({ intent: "test", action });
}

describe("sdk: MemoryExporter", () => {
  it("validates maxEvents and implements a ring buffer", async () => {
    expect(() => new MemoryExporter({ maxEvents: 0 })).toThrow(
      /"maxEvents" must be a finite number >= 1/,
    );
    expect(() => new MemoryExporter({ maxEvents: -1 })).toThrow(
      /"maxEvents" must be a finite number >= 1/,
    );
    expect(() => new MemoryExporter({ maxEvents: Number.NaN })).toThrow(
      /"maxEvents" must be a finite number >= 1/,
    );

    const m = new MemoryExporter();
    await expect(m.flush()).resolves.toBeUndefined();

    const ring = new MemoryExporter({ maxEvents: 2 });
    ring.export(testEvent({ id: "1" }));
    ring.export(testEvent({ id: "2" }));
    ring.export(testEvent({ id: "3" }));
    const evs = ring.getEvents();
    expect(evs).toHaveLength(2);
    expect(evs[0]!.id).toBe("2");
    expect(evs[1]!.id).toBe("3");
  });
});

describe("sdk: HttpExporter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates url and timeoutMs", () => {
    expect(() => new HttpExporter({ url: "" })).toThrow(/trimmed length is 0/);
    expect(() => new HttpExporter({ url: "   " })).toThrow(/trimmed length is 0/);
    expect(() => new HttpExporter({ url: 1 as unknown as string })).toThrow(
      /got number/,
    );
    expect(() => new HttpExporter({ url: null as unknown as string })).toThrow(
      /got null/,
    );
    expect(() => new HttpExporter({ url: [] as unknown as string })).toThrow(
      /got array/,
    );

    const base = { url: "https://ingest.example/v1/e" };
    expect(() => new HttpExporter({ ...base, timeoutMs: 0 })).toThrow(
      /"timeoutMs" must be a finite number > 0/,
    );
    expect(() => new HttpExporter({ ...base, timeoutMs: -1 })).toThrow(
      /"timeoutMs" must be a finite number > 0/,
    );
    expect(() => new HttpExporter({ ...base, timeoutMs: Number.NaN })).toThrow(
      /"timeoutMs" must be a finite number > 0/,
    );
  });

  it("normalizes method and headers, reports HTTP and network errors, and supports timeouts", async () => {
    const fetchMock = vi.fn(
      async (): Promise<Response> =>
        new Response("no", { status: 502, statusText: "Bad Gateway" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const errors: unknown[] = [];
    const http = new HttpExporter({
      url: "https://x.test/e",
      method: "PUT",
      headers: { "x-api-key": "k" },
      awaitEach: true,
      onError: (e) => errors.push(e),
    });

    await http.export(testEvent({ action: "test.http" }));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("k");
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toMatch(/HTTP 502/);

    const hdrFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", hdrFetch);
    const hdrHttp = new HttpExporter({
      url: "https://x.test/e",
      headers: ["a", "b"] as unknown as Record<string, string>,
      awaitEach: true,
    });
    await hdrHttp.export(testEventByAction("hdr.arr"));
    const [, hdrInit] = hdrFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(hdrInit.headers).toMatchObject({
      "content-type": "application/json",
    });

    const methodFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", methodFetch);
    const methodHttp = new HttpExporter({
      url: "https://x.test/e",
      method: "  \t",
      awaitEach: true,
    });
    await methodHttp.export(testEventByAction("http.trim.method"));
    const [, mInit] = methodFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(mInit.method).toBe("POST");

    const timeoutFetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeDefined();
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", timeoutFetch);
    const timeoutHttp = new HttpExporter({
      url: "https://x.test/e",
      timeoutMs: 5000,
      awaitEach: true,
    });
    await timeoutHttp.export(testEvent({}));

    const netFetch = vi.fn(async () => {
      throw new Error("network");
    });
    vi.stubGlobal("fetch", netFetch);
    const netErrors: unknown[] = [];
    const netHttp = new HttpExporter({
      url: "https://x.test/e",
      awaitEach: true,
      onError: (e) => netErrors.push(e),
    });
    await netHttp.export(testEvent({}));
    expect(netErrors.some((e) => String(e).includes("network"))).toBe(true);
  });

  it("flush waits for in-flight work; shutdown rejects new exports", async () => {
    let completed = 0;
    const slowFetch = vi.fn(async (): Promise<Response> => {
      await new Promise((r) => setTimeout(r, 35));
      completed++;
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", slowFetch);

    const asyncHttp = new HttpExporter({
      url: "https://ingest.example/v1/e",
      awaitEach: false,
    });
    asyncHttp.export(testEventByAction("a1"));
    asyncHttp.export(testEventByAction("a2"));
    expect(completed).toBe(0);
    await asyncHttp.flush();
    expect(completed).toBe(2);

    const idleFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", idleFetch);
    const idleHttp = new HttpExporter({ url: "https://x.test/e" });
    await expect(idleHttp.flush()).resolves.toBeUndefined();

    const shutFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", shutFetch);
    const shutErrors: unknown[] = [];
    const shutHttp = new HttpExporter({
      url: "https://ingest.example/v1/e",
      onError: (e) => shutErrors.push(e),
    });
    await shutHttp.shutdown();
    shutHttp.export(testEventByAction("late"));
    expect(shutErrors).toHaveLength(1);
  });

  it("uses safeJsonEnvelope when custom body throws or event serialization fails", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const errors: unknown[] = [];
    const http = new HttpExporter({
      url: "https://x.test/e",
      awaitEach: true,
      body: () => {
        throw new Error("body boom");
      },
      onError: (e) => errors.push(e),
    });
    await http.export(testEvent({ action: "test.http" }));
    expect(errors[0]).toMatchObject({ message: "body boom" });
    const [, reqInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(reqInit.body));
    expect(body["intentproof"]).toBe("1");
    expect(body.event.action).toBe("test.http");

    const evilFetch = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", evilFetch);
    const evil = testEvent({});
    Object.defineProperty(evil, "intent", {
      enumerable: true,
      configurable: true,
      get() {
        throw new Error("evil");
      },
    });
    const evilHttp = new HttpExporter({
      url: "https://x.test/e",
      awaitEach: true,
      body: () => {
        throw new Error("body");
      },
      onError: () => {},
    });
    await evilHttp.export(evil);
    const [, evilInit] = evilFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(evilInit.body)).toContain("eventSerializeFailed");
  });
});

describe("sdk: BoundedQueueExporter", () => {
  it("validates inner exporter and strategy", () => {
    expect(
      () =>
        new BoundedQueueExporter({
          exporter: null as unknown as Exporter,
        }),
    ).toThrow(/"exporter" must be an object with an export\(\) method/);
    expect(
      () =>
        new BoundedQueueExporter({
          exporter: {} as Exporter,
        }),
    ).toThrow(/"exporter" must be an object with an export\(\) method/);

    const mem = new MemoryExporter();
    expect(
      () =>
        new BoundedQueueExporter({
          exporter: mem,
          strategy: "drop-middle" as unknown as "drop-newest",
        }),
    ).toThrow(/"strategy" must be "drop-newest" or "drop-oldest"/);
  });

  it("coerces bad limits, respects concurrency, overflows, shutdown, and inner errors", async () => {
    const innerCoerce = new MemoryExporter();
    for (const maxQueue of [Number.NaN, -3] as unknown as number[]) {
      const q = new BoundedQueueExporter({
        exporter: innerCoerce,
        maxConcurrent: 2,
        maxQueue: maxQueue as number,
      });
      q.export(testEventByAction("mq.coerce"));
      await q.shutdown();
    }
    expect(innerCoerce.getEvents().length).toBeGreaterThanOrEqual(1);

    let concurrent = 0;
    let peak = 0;
    const innerNaN: Exporter = {
      export() {
        concurrent++;
        peak = Math.max(peak, concurrent);
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            concurrent--;
            resolve();
          }, 15);
        });
      },
    };
    const qNaN = new BoundedQueueExporter({
      exporter: innerNaN,
      maxConcurrent: Number.NaN as unknown as number,
      maxQueue: 100,
    });
    for (let i = 0; i < 12; i++) {
      qNaN.export(testEventByAction(`nc${i}`));
    }
    await qNaN.shutdown();
    expect(peak).toBeLessThanOrEqual(4);

    concurrent = 0;
    peak = 0;
    const innerCap: Exporter = {
      export() {
        concurrent++;
        peak = Math.max(peak, concurrent);
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            concurrent--;
            resolve();
          }, 20);
        });
      },
    };
    const qCap = new BoundedQueueExporter({
      exporter: innerCap,
      maxConcurrent: 2,
      maxQueue: 100,
    });
    for (let i = 0; i < 8; i++) {
      qCap.export(testEventByAction(`c${i}`));
    }
    await qCap.shutdown();
    expect(peak).toBeLessThanOrEqual(2);

    const actions: string[] = [];
    const innerDrop: Exporter = {
      export(e) {
        actions.push(e.action);
        return new Promise<void>((r) => setTimeout(r, 60));
      },
    };
    const dropsNew: string[] = [];
    const qNew = new BoundedQueueExporter({
      exporter: innerDrop,
      maxConcurrent: 1,
      maxQueue: 1,
      strategy: "drop-newest",
      onDrop: (_e, reason) => dropsNew.push(reason),
    });
    for (let i = 0; i < 8; i++) {
      qNew.export(testEventByAction(`e${i}`));
    }
    await qNew.shutdown();
    expect(dropsNew.some((d) => d.includes("overflow"))).toBe(true);
    expect(actions.length).toBeLessThan(8);

    const seen: string[] = [];
    const innerOld: Exporter = {
      export(e) {
        seen.push(e.action);
        return new Promise<void>((r) => setTimeout(r, 40));
      },
    };
    const dropsOld: string[] = [];
    const qOld = new BoundedQueueExporter({
      exporter: innerOld,
      maxConcurrent: 1,
      maxQueue: 1,
      strategy: "drop-oldest",
      onDrop: (_e, reason) => dropsOld.push(reason),
    });
    for (let i = 0; i < 4; i++) {
      qOld.export(testEvent({ action: "math.add", id: `ev-${i}` }));
    }
    await qOld.shutdown();
    expect(dropsOld.some((d) => d.includes("overflow"))).toBe(true);

    const innerZero: Exporter = { export: () => {} };
    const qZero = new BoundedQueueExporter({
      exporter: innerZero,
      maxConcurrent: 1,
      maxQueue: 0,
    });
    for (let i = 0; i < 20; i++) {
      qZero.export(testEvent({ action: "math.add", id: `z-${i}` }));
    }
    await qZero.shutdown();

    const innerSyncErr: Exporter = {
      export() {
        throw new Error("inner sync");
      },
    };
    const errsSync: unknown[] = [];
    const qSyncErr = new BoundedQueueExporter({
      exporter: innerSyncErr,
      maxConcurrent: 1,
      maxQueue: 10,
      onInnerError: (e) => errsSync.push(e),
    });
    qSyncErr.export(testEvent({}));
    await qSyncErr.flush();
    expect(errsSync).toHaveLength(1);

    const innerAsyncErr: Exporter = {
      export() {
        return Promise.reject(new Error("inner async"));
      },
    };
    const errsAsync: unknown[] = [];
    const qAsyncErr = new BoundedQueueExporter({
      exporter: innerAsyncErr,
      maxConcurrent: 1,
      maxQueue: 10,
      onInnerError: (e) => errsAsync.push(e),
    });
    qAsyncErr.export(testEvent({}));
    await qAsyncErr.flush();
    expect(errsAsync).toHaveLength(1);

    await expect(
      new BoundedQueueExporter({
        exporter: { export() {} },
        maxConcurrent: 2,
      }).flush(),
    ).resolves.toBeUndefined();

    const dropsShut: string[] = [];
    const qShut = new BoundedQueueExporter({
      exporter: { export() {} },
      onDrop: (_e, r) => dropsShut.push(r),
    });
    await qShut.shutdown();
    qShut.export(testEvent({}));
    expect(dropsShut).toEqual(["shutdown"]);
  });

  it("chains with HttpExporter and IntentProofClient for bounded ingest", async () => {
    const bodies: string[] = [];
    const fetchMock = vi.fn(
      async (_url: string, init: RequestInit): Promise<Response> => {
        bodies.push(String(init.body));
        return new Response("ok", { status: 200 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const memory = new MemoryExporter();
    const http = new HttpExporter({
      url: "https://ingest.example.com/v1/executions",
      awaitEach: true,
    });
    const queued = new BoundedQueueExporter({
      exporter: http,
      maxConcurrent: 2,
      maxQueue: 50,
    });
    const sink = createExporterErrorSink();
    const v = createIntentProofClient({
      exporters: [memory, queued],
      onExporterError: sink.onExporterError,
    });

    const charge = v.wrap(
      {
        intent: "Charge order",
        action: "stripe.payment_intent.capture",
        correlationId: "webhook_evt_1",
        captureInput: (args) => {
          const [id] = args as [string];
          return { orderId: id };
        },
      },
      (orderId: string) => ({ ok: true, orderId }),
    );

    charge("ord_789");

    await v.shutdown();

    expect(fetchMock).toHaveBeenCalledOnce();
    const parsed = JSON.parse(bodies[0]!) as {
      intentproof: string;
      event: { action: string; correlationId: string; intent: string };
    };
    expect(parsed["intentproof"]).toBe("1");
    expect(parsed.event.action).toBe("stripe.payment_intent.capture");
    expect(parsed.event.correlationId).toBe("webhook_evt_1");
    expect(memory.getEvents()).toHaveLength(1);

    sink.assertEmpty();
    vi.unstubAllGlobals();
  });
});
