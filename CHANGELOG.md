# Changelog

Repository: [IntentProof Node SDK (`intentproof-sdk-node`)](https://github.com/intentproof/intentproof-sdk-node).

All notable changes to this repository are documented here. The publishable package is **`@intentproof/sdk`** in [`packages/sdk`](packages/sdk/) (SemVer on npm). Git release tags use **`vMAJOR.MINOR.PATCH`** (see [`.github/workflows/release.yml`](.github/workflows/release.yml)).

## Unreleased

## 0.1.2 — 2026-05-04

- Add **`CHANGELOG.md`** (this file).
- **CI:** run the [IntentProof specification](https://github.com/intentproof/intentproof-spec) Vitest conformance oracle on every push/PR (`.github/workflows/ci.yml`).
- **Local:** `npm run spec:conformance` via [`scripts/spec-conformance.sh`](scripts/spec-conformance.sh) (sibling clone `../intentproof-spec` or `INTENTPROOF_SPEC_ROOT`).
- **Docs:** README refresh—positioning, reference tables (`IntentProofClient`, `ExecutionEvent`, config), canonical spec section, security advisory link, version-pinned install example, JSON envelope wording.
- **Metadata:** normalize `repository.url` to `github.com/intentproof/...` (root + `packages/sdk`); add npm keyword **`IntentProof`**.
- **Tooling:** dev **`vitest`** / **`@vitest/coverage-v8`** **4.x**, **`typescript`** **6.x**; **`tsconfig`**: **`types: ["node"]`**, **`ignoreDeprecations": "6.0"`** (TS 6 globals + **`tsup`** DTS).
- **Tests / automation:** **`snapshot`** and **`BoundedQueueExporter`** adjustments for Vitest 4 V8 branch coverage at **100%**; Dependabot drops major **`ignore`** rules for Vitest, coverage, and TypeScript.

## 0.1.1 — 2026-05-04

- Public **npm** package **`@intentproof/sdk`**: `wrap` / `configure`, **`ExecutionEvent`** emission, memory and HTTP exporters, async correlation, and Vitest test suite.
