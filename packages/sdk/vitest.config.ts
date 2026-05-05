import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

/** Sibling `intentproof-spec` clone for integration tests that import the spec harness. */
const siblingSpec = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../intentproof-spec",
);

export default defineConfig({
  define: {
    __INTENTPROOF_SDK_VERSION__: JSON.stringify(version),
  },
  server: {
    fs: {
      allow: [
        path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../.."),
        siblingSpec,
      ],
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.scenarios.ts",
        "src/exporters.test-helpers.ts",
        "src/types.ts",
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
