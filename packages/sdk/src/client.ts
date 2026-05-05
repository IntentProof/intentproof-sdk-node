import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import { MemoryExporter } from "./exporters/memory.js";
import { describeValueType, isPromiseLike } from "./runtime.js";
import { snapshot } from "./snapshot.js";
import { assertValidExecutionEventWire } from "./validators.js";
import type {
  ExecutionErrorSnapshot,
  ExecutionEvent,
  ExecutionEventBase,
  ExecutionStatus,
  Exporter,
  IntentProofConfig,
  SerializeOptions,
  WrapOptions,
} from "./types.js";
import type {
  IntentProofExecutionEventV1,
  JsonValue,
} from "./generated/execution-event.js";

const correlationStore = new AsyncLocalStorage<string>();

/**
 * JSON Schema requires `inputs` to be an object; positional snapshots may be arrays — wrap them.
 */
function normalizeInputsForExecutionEvent(
  inputs: unknown,
): IntentProofExecutionEventV1["inputs"] {
  if (inputs !== null && typeof inputs === "object" && !Array.isArray(inputs)) {
    return inputs as IntentProofExecutionEventV1["inputs"];
  }
  return { args: inputs } as IntentProofExecutionEventV1["inputs"];
}

/**
 * Validates a correlation id: non-empty string after trim (same as `WrapOptions.correlationId` /
 * {@link assertWrapOptionsShape}). Used by {@link runWithCorrelationId}.
 */
export function assertCorrelationId(id: unknown): asserts id is string {
  if (typeof id !== "string") {
    throw new TypeError(
      `IntentProofClient: "correlationId" must be a string, got ${describeValueType(id)}`,
    );
  }
  if (id.trim().length === 0) {
    throw new TypeError(
      `IntentProofClient: "correlationId" must be a non-empty string (trimmed length is 0)`,
    );
  }
}

/** Active correlation id from async context, if any. */
export function getCorrelationId(): string | undefined {
  return correlationStore.getStore();
}

/**
 * Run `fn` with an explicit `correlationId` in async context. The id must be a non-empty string
 * after trim ({@link assertCorrelationId}) — the parameter name implies a caller-supplied id.
 */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  if (typeof fn !== "function") {
    throw new TypeError(
      "IntentProofClient: expected runWithCorrelationId(correlationId, fn)",
    );
  }
  assertCorrelationId(correlationId);
  return correlationStore.run(correlationId, fn);
}

function defaultOnExporterError(error: unknown, _event: ExecutionEvent): void {
  console.error("[intentproof] exporter error", error);
}

function toErrorSnapshot(e: unknown, includeStack: boolean): ExecutionErrorSnapshot {
  if (e instanceof Error) {
    return includeStack
      ? { name: e.name, message: e.message, stack: e.stack }
      : { name: e.name, message: e.message };
  }
  return { name: "Error", message: String(e) };
}

function assertExporterAtIndex(ex: unknown, index: number): void {
  if (
    ex == null ||
    typeof ex !== "object" ||
    typeof (ex as Exporter).export !== "function"
  ) {
    throw new TypeError(
      `IntentProofClient: exporters[${index}] must be an object with an export() method`,
    );
  }
}

function assertAttributesRecord(label: string, value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(
      `IntentProofClient: ${label} must be a plain object, got ${describeValueType(value)}`,
    );
  }
  const o = value as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    const v = o[key];
    const t = typeof v;
    if (t !== "string" && t !== "number" && t !== "boolean") {
      throw new TypeError(
        `IntentProofClient: ${label}[${JSON.stringify(key)}] must be a string, number, or boolean, got ${describeValueType(v)}`,
      );
    }
  }
}

/** Runtime validation for {@link IntentProofClient.wrap} options. */
export function assertWrapOptionsShape(options: WrapOptions): void {
  if (typeof options.intent !== "string") {
    throw new TypeError(
      `IntentProofClient: "intent" must be a string, got ${describeValueType(options.intent)}`,
    );
  }
  if (options.intent.trim().length === 0) {
    throw new TypeError(
      `IntentProofClient: "intent" must be a non-empty string (trimmed length is 0)`,
    );
  }
  if (typeof options.action !== "string") {
    throw new TypeError(
      `IntentProofClient: "action" must be a string, got ${describeValueType(options.action)}`,
    );
  }
  if (options.action.trim().length === 0) {
    throw new TypeError(
      `IntentProofClient: "action" must be a non-empty string (trimmed length is 0)`,
    );
  }
  if (
    options.correlationId !== undefined &&
    typeof options.correlationId !== "string"
  ) {
    throw new TypeError(
      `IntentProofClient: "correlationId" must be a string when provided, got ${describeValueType(options.correlationId)}`,
    );
  }
  if (
    options.correlationId !== undefined &&
    options.correlationId.trim().length === 0
  ) {
    throw new TypeError(
      `IntentProofClient: "correlationId" must be a non-empty string when provided (trimmed length is 0)`,
    );
  }
  if (options.attributes !== undefined) {
    assertAttributesRecord("WrapOptions.attributes", options.attributes);
  }
  if (options.includeErrorStack !== undefined) {
    if (typeof options.includeErrorStack !== "boolean") {
      throw new TypeError(
        `IntentProofClient: "includeErrorStack" must be a boolean when provided, got ${describeValueType(options.includeErrorStack)}`,
      );
    }
  }
}

export class IntentProofClient {
  private exporters: Exporter[] = [new MemoryExporter()];
  private onExporterError: (error: unknown, event: ExecutionEvent) => void =
    defaultOnExporterError;
  private defaultAttributes: Readonly<Record<string, string | number | boolean>> = {};
  private includeErrorStack = true;

  constructor(config: IntentProofConfig = {}) {
    this.configure(config);
  }

  configure(config: IntentProofConfig): void {
    if (config.exporters !== undefined) {
      for (let i = 0; i < config.exporters.length; i++) {
        assertExporterAtIndex(config.exporters[i], i);
      }
      this.exporters = [...config.exporters];
    }
    if (config.onExporterError !== undefined) {
      if (typeof config.onExporterError !== "function") {
        throw new TypeError(
          `IntentProofClient: onExporterError must be a function, got ${describeValueType(config.onExporterError)}`,
        );
      }
      this.onExporterError = config.onExporterError;
    }
    if (config.defaultAttributes !== undefined) {
      assertAttributesRecord("defaultAttributes", config.defaultAttributes);
      this.defaultAttributes = config.defaultAttributes;
    }
    if (config.includeErrorStack !== undefined) {
      if (typeof config.includeErrorStack !== "boolean") {
        throw new TypeError(
          `IntentProofClient: includeErrorStack must be a boolean when provided, got ${describeValueType(config.includeErrorStack)}`,
        );
      }
      this.includeErrorStack = config.includeErrorStack;
    }
  }

  /**
   * Await optional {@link Exporter.flush} on each exporter (parallel).
   * Used for graceful shutdown or tests.
   */
  flush(): Promise<void> {
    return Promise.all(
      this.exporters.map((ex) =>
        typeof ex.flush === "function"
          ? Promise.resolve(ex.flush())
          : Promise.resolve(),
      ),
    ).then(() => {});
  }

  /**
   * {@link Exporter.shutdown} when present, otherwise {@link Exporter.flush}.
   */
  shutdown(): Promise<void> {
    return Promise.all(
      this.exporters.map((ex) => {
        if (typeof ex.shutdown === "function") {
          return Promise.resolve(ex.shutdown());
        }
        if (typeof ex.flush === "function") {
          return Promise.resolve(ex.flush());
        }
        return Promise.resolve();
      }),
    ).then(() => {});
  }

  /** Read active correlation id (AsyncLocalStorage). */
  getCorrelationId(): string | undefined {
    return getCorrelationId();
  }

  /**
   * Run `fn` with a generated correlation id for nested `wrap` calls (callers do not supply an id).
   */
  withCorrelation<T>(fn: () => T): T;
  /**
   * Run `fn` under an optional inbound `correlationId`. Non-empty after trim uses that id;
   * empty or whitespace-only values generate a UUID instead (e.g. missing request header).
   * To require a validated, non-blank id, use {@link runWithCorrelationId}.
   */
  withCorrelation<T>(correlationId: string, fn: () => T): T;
  withCorrelation<T>(correlationIdOrFn: string | (() => T), maybeFn?: () => T): T {
    if (typeof correlationIdOrFn === "function") {
      return runWithCorrelationId(randomUUID(), correlationIdOrFn);
    }
    if (typeof correlationIdOrFn !== "string") {
      throw new TypeError(
        "IntentProofClient: withCorrelation: correlation id must be a string",
      );
    }
    if (typeof maybeFn !== "function") {
      throw new TypeError(
        "IntentProofClient: expected withCorrelation(fn) or withCorrelation(correlationId, fn)",
      );
    }
    const fn = maybeFn;
    const id = correlationIdOrFn;
    if (id.trim().length === 0) {
      return runWithCorrelationId(randomUUID(), fn);
    }
    return runWithCorrelationId(id, fn);
  }

  /**
   * Wrap a function to emit one `ExecutionEvent` per invocation (sync or async).
   */
  wrap<A extends unknown[], R>(
    options: WrapOptions,
    fn: (...args: A) => R,
  ): (...args: A) => R {
    assertWrapOptionsShape(options);
    if (typeof fn !== "function") {
      throw new TypeError(
        `IntentProofClient: wrap() second argument must be a function, got ${describeValueType(fn)}`,
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- `function` wrapper uses `fn.apply(this, …)`
    const self = this;
    const wrapped = function (this: unknown, ...args: A): R {
      const correlationId = options.correlationId ?? getCorrelationId() ?? undefined;
      const startedAt = new Date();
      const serOpts: SerializeOptions = {
        maxDepth: options.maxDepth,
        maxKeys: options.maxKeys,
        redactKeys: options.redactKeys,
        maxStringLength: options.maxStringLength,
      };
      let inputs: unknown;
      if (options.captureInput) {
        try {
          inputs = options.captureInput(args as unknown[]);
        } catch {
          inputs = snapshot(args as unknown[], serOpts);
        }
      } else {
        inputs = snapshot(args as unknown[], serOpts);
      }

      const base: ExecutionEventBase = {
        id: randomUUID(),
        correlationId,
        intent: options.intent,
        action: options.action,
        inputs: normalizeInputsForExecutionEvent(inputs),
        startedAt: startedAt.toISOString(),
        attributes: mergeAttrs(
          self.defaultAttributes,
          options.attributes,
        ) as IntentProofExecutionEventV1["attributes"],
      };

      try {
        const out = fn.apply(this, args as unknown as A);
        if (isPromiseLike(out)) {
          return self.handleAsync(out, base, options, serOpts, startedAt) as R;
        }
        self.emitComplete(
          base,
          "ok",
          out,
          undefined,
          options,
          serOpts,
          startedAt,
          self.includeErrorStack,
        );
        return out;
      } catch (e) {
        self.emitComplete(
          base,
          "error",
          undefined,
          e,
          options,
          serOpts,
          startedAt,
          self.includeErrorStack,
        );
        throw e;
      }
    };
    Object.defineProperty(wrapped, "name", {
      value: `intentproof(${fn.name || "anonymous"})`,
      configurable: true,
    });
    return wrapped as (...args: A) => R;
  }

  private handleAsync(
    p: PromiseLike<unknown>,
    base: ExecutionEventBase,
    options: WrapOptions,
    serOpts: SerializeOptions,
    startedAt: Date,
  ): Promise<unknown> {
    const includeStack = this.includeErrorStack;
    return Promise.resolve(p).then(
      (value) => {
        this.emitComplete(
          base,
          "ok",
          value,
          undefined,
          options,
          serOpts,
          startedAt,
          includeStack,
        );
        return value;
      },
      (err) => {
        this.emitComplete(
          base,
          "error",
          undefined,
          err,
          options,
          serOpts,
          startedAt,
          includeStack,
        );
        throw err;
      },
    );
  }

  private emitComplete(
    base: ExecutionEventBase,
    status: ExecutionStatus,
    result: unknown,
    error: unknown | undefined,
    options: WrapOptions,
    serOpts: SerializeOptions,
    startedAt: Date,
    defaultIncludeErrorStack: boolean,
  ): void {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    let output: unknown | undefined;
    let errSnap: ExecutionErrorSnapshot | undefined;
    const includeStack = options.includeErrorStack ?? defaultIncludeErrorStack;

    if (status === "ok") {
      try {
        output = options.captureOutput
          ? options.captureOutput(result)
          : snapshot(result, serOpts);
      } catch {
        output = snapshot(result, serOpts);
      }
    } else {
      errSnap = toErrorSnapshot(error, includeStack);
      if (options.captureError) {
        try {
          output = options.captureError(error);
        } catch {
          output = undefined;
        }
      }
    }

    const event: ExecutionEvent =
      status === "ok"
        ? {
            ...base,
            status,
            completedAt: completedAt.toISOString(),
            durationMs,
            output: output as JsonValue | undefined,
          }
        : {
            ...base,
            status,
            completedAt: completedAt.toISOString(),
            durationMs,
            error: errSnap,
            ...(output !== undefined ? { output: output as JsonValue } : {}),
          };

    this.dispatch(event);
  }

  private dispatch(event: ExecutionEvent): void {
    assertValidExecutionEventWire(JSON.parse(JSON.stringify(event)) as unknown);
    for (const ex of this.exporters) {
      try {
        const r = ex.export(event);
        if (isPromiseLike(r)) {
          void r.catch((e) => this.onExporterError(e, event));
        }
      } catch (e) {
        this.onExporterError(e, event);
      }
    }
  }
}

function mergeAttrs(
  a: Readonly<Record<string, string | number | boolean>>,
  b: Readonly<Record<string, string | number | boolean>> | undefined,
): Readonly<Record<string, string | number | boolean>> | undefined {
  if (!b || Object.keys(b).length === 0) {
    return Object.keys(a).length ? { ...a } : undefined;
  }
  return { ...a, ...b };
}

let defaultClient: IntentProofClient | null = null;

export function getIntentProofClient(): IntentProofClient {
  if (!defaultClient) defaultClient = new IntentProofClient();
  return defaultClient;
}
