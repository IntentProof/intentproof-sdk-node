import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Fingerprint = {
  specVersion: string;
  algorithm: string;
  generator: { name: string; version: string };
  files: Record<string, string>;
  aggregate: string;
};

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

describe("generated spec fingerprint", () => {
  it("matches pinned spec schemas", () => {
    const sdkRoot = path.resolve(import.meta.dirname, "../../..");
    const specRoot =
      process.env.INTENTPROOF_SPEC_ROOT ?? path.resolve(sdkRoot, "../intentproof-spec");
    const spec = JSON.parse(
      fs.readFileSync(path.join(specRoot, "spec.json"), "utf8"),
    ) as {
      version: string;
      schemas: Record<string, string>;
    };
    const fp = JSON.parse(
      fs.readFileSync(
        path.join(sdkRoot, "packages/sdk/src/generated/spec_fingerprint.json"),
        "utf8",
      ),
    ) as Fingerprint;

    expect(fp.specVersion).toBe(spec.version);
    expect(fp.algorithm).toBe("sha256");
    expect(fp.generator.name).toBe("json-schema-to-typescript");

    const schemaPaths = Object.values(spec.schemas).sort();
    const lines: string[] = [];
    for (const rel of schemaPaths) {
      const raw = fs.readFileSync(path.join(specRoot, rel), "utf8");
      const digest = sha256(raw);
      expect(fp.files[rel]).toBe(digest);
      lines.push(`${rel}:${digest}`);
    }
    expect(fp.aggregate).toBe(sha256(lines.join("\n")));
  });
});
