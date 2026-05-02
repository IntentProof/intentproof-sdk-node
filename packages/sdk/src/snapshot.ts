import type { SerializeOptions } from "./types.js";

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_KEYS = 50;

function snapshotLimit(n: number | undefined, fallback: number): number {
  if (n === undefined) return fallback;
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  return i < 0 ? fallback : i;
}

function snapshotStringLimit(n: number | undefined): number | undefined {
  if (n === undefined) return undefined;
  if (!Number.isFinite(n)) return undefined;
  const i = Math.trunc(n);
  return i < 0 ? undefined : i;
}

function normalizeRedactSet(redactKeys: string[] | undefined): Set<string> | undefined {
  if (!redactKeys?.length) return undefined;
  const set = new Set(
    redactKeys
      .filter((k): k is string => typeof k === "string" && k.length > 0)
      .map((k) => k.toLowerCase()),
  );
  return set.size > 0 ? set : undefined;
}

function shouldRedactKey(key: string, redact: Set<string> | undefined): boolean {
  if (!redact) return false;
  return redact.has(key.toLowerCase());
}

function truncateString(s: string, maxLen: number | undefined): string {
  if (maxLen === undefined || s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…[truncated ${s.length - maxLen} chars]`;
}

/** JSON-safe value for `ExecutionEvent` inputs/output (depth/key limits, optional redaction). */
export function snapshot(value: unknown, options: SerializeOptions = {}): unknown {
  const maxDepth = snapshotLimit(options.maxDepth, DEFAULT_MAX_DEPTH);
  const maxKeys = snapshotLimit(options.maxKeys, DEFAULT_MAX_KEYS);
  const maxStringLength = snapshotStringLimit(options.maxStringLength);
  const redact = normalizeRedactSet(options.redactKeys);
  const seen = new WeakSet<object>();

  function walk(v: unknown, depth: number): unknown {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") {
      if (t === "string") return truncateString(v as string, maxStringLength);
      return v;
    }
    if (t === "bigint") return (v as bigint).toString();
    if (t === "symbol") return (v as symbol).toString();
    if (t === "function") {
      const fn = v as { name?: string };
      return `[Function ${fn.name || "anonymous"}]`;
    }
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) {
      if (depth >= maxDepth) return "[Array]";
      return v.slice(0, maxKeys).map((item) => walk(item, depth + 1));
    }
    if (t === "object") {
      const o = v as object;
      if (seen.has(o)) return "[Circular]";
      seen.add(o);
      if (depth >= maxDepth) return "[Object]";
      const out: Record<string, unknown> = {};
      const keys = Object.keys(o);
      let n = 0;
      for (const k of keys) {
        if (n >= maxKeys) {
          out["…"] = `${keys.length - maxKeys} more keys`;
          break;
        }
        try {
          if (shouldRedactKey(k, redact)) {
            out[k] = "[REDACTED]";
          } else {
            out[k] = walk((o as Record<string, unknown>)[k], depth + 1);
          }
        } catch {
          out[k] = "[Unserializable]";
        }
        n += 1;
      }
      return out;
    }
  }

  try {
    return walk(value, 0);
  } catch {
    return "[SnapshotError]";
  }
}
