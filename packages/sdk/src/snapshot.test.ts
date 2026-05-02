/** JSON snapshot limits for event payloads. */
import { describe, expect, it } from "vitest";
import { snapshot } from "./index.js";

describe("sdk: snapshot serialization", () => {
  it("normalizes redactKeys, truncates strings, and coerces bad numeric limits", () => {
    expect(
      snapshot({ password: "x" }, { redactKeys: ["", null as unknown as string] }),
    ).toEqual({ password: "x" });

    const out = snapshot(
      { password: "secret", token: "t", ok: 1 },
      {
        redactKeys: ["", "password", null as unknown as string, "TOKEN"],
      },
    ) as Record<string, unknown>;
    expect(out.password).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
    expect(out.ok).toBe(1);

    const mixed = snapshot(
      { Password: "secret", ok: "yes" },
      { redactKeys: ["password"] },
    ) as Record<string, unknown>;
    expect(mixed.Password).toBe("[REDACTED]");
    expect(mixed.ok).toBe("yes");

    const truncated = snapshot("abcdefghij", {
      maxStringLength: 4,
    }) as string;
    expect(truncated).toContain("abcd");
    expect(truncated).toContain("truncated");

    const deep = { a: { b: 1 } };
    expect(snapshot(deep, { maxDepth: -1 })).toEqual(snapshot(deep));
    expect(snapshot(deep, { maxDepth: Number.NaN })).toEqual(snapshot(deep));
    const wide = { k0: 0, k1: 1 };
    expect(snapshot(wide, { maxKeys: -1 })).toEqual(snapshot(wide));
    expect(snapshot("abcdef", { maxStringLength: Number.NaN })).toBe("abcdef");
    expect(snapshot("abcdef", { maxStringLength: -1 })).toBe("abcdef");
  });

  it("handles primitives, collections, cycles, depth/key caps, and failure modes", () => {
    expect(snapshot(1n)).toBe("1");
    expect(snapshot(Symbol("s"))).toBe("Symbol(s)");
    expect(snapshot(function named() {})).toBe("[Function named]");
    expect(snapshot(() => {})).toBe("[Function anonymous]");
    expect(snapshot(new Date("2026-01-01T00:00:00.000Z"))).toBe(
      "2026-01-01T00:00:00.000Z",
    );

    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(snapshot(circular)).toEqual({ a: 1, self: "[Circular]" });

    const deep = { l1: { l2: { l3: { l4: { l5: { l6: { l7: 1 } } } } } } };
    expect(snapshot(deep, { maxDepth: 2 })).toEqual({
      l1: { l2: "[Object]" },
    });

    expect(snapshot([1, 2], { maxDepth: 0 })).toBe("[Array]");

    const wide: Record<string, number> = {};
    for (let i = 0; i < 5; i++) wide[`k${i}`] = i;
    const sw = snapshot(wide, { maxKeys: 3 }) as Record<string, unknown>;
    expect(Object.keys(sw)).toContain("…");
    expect(String(sw["…"])).toContain("more keys");

    expect(snapshot({ ok: 1 }, { redactKeys: [] })).toEqual({ ok: 1 });

    const o: Record<string, unknown> = {};
    Object.defineProperty(o, "bad", {
      enumerable: true,
      configurable: true,
      get() {
        throw new Error("no");
      },
    });
    o.good = 1;
    const thrown = snapshot(o) as Record<string, unknown>;
    expect(thrown.good).toBe(1);
    expect(thrown.bad).toBe("[Unserializable]");

    const { proxy, revoke } = Proxy.revocable({ x: 1 }, {});
    revoke();
    expect(snapshot(proxy)).toBe("[SnapshotError]");
  });
});
