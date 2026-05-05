# Changelog

Repository: [IntentProof Node SDK (`intentproof-sdk-node`)](https://github.com/IntentProof/intentproof-sdk-node).

All notable changes to this repository are documented here. The publishable package is **`@intentproof/sdk`** in [`packages/sdk`](packages/sdk/) (SemVer on npm). Git release tags use **`vMAJOR.MINOR.PATCH`** (see [`.github/workflows/release.yml`](.github/workflows/release.yml)).

## Unreleased

- Add generated schema fingerprint metadata (`packages/sdk/src/generated/spec_fingerprint.json`) during type generation.
- Add fingerprint conformance test (`packages/sdk/src/generated_fingerprint.test.ts`) to verify schema hashes/aggregate against pinned `intentproof-spec`.
- Harden generated drift checks: verify script now fails on untracked files in generated directories.
- Tighten bundled-schema guard: only `./intentproof-spec/schema/*.schema.json` is allowed; any other checked-in `*.schema.json` path now fails CI.
- Harden model/type provenance enforcement: `scripts/check-no-handwritten-model-types.sh` delegates to the shared `intentproof-spec` checker for hardening compliance.
- Fix one wire-type import regression by sourcing `JsonValue` directly from `packages/sdk/src/generated/execution-event.ts` in `packages/sdk/src/client.ts`.
- CI hardening: add explicit `hardening` workflow job and release preflight check-run gate (`hardening`, `intentproof-spec`, `sdk (22)`, `sdk (24)`).
- Release workflow now checks out `intentproof-spec` and sets `INTENTPROOF_SPEC_ROOT` before running `npm run ci`.
- SDK conformance wrapper now exports standardized report metadata fields (`INTENTPROOF_SDK_NAME`, `INTENTPROOF_SDK_LANGUAGE`, `INTENTPROOF_SDK_VERSION`).
- CI `intentproof-spec` job now uploads `intentproof-spec/conformance-report.json` as `conformance-report-node`.
- `scripts/spec-conformance.sh` falls back to `./intentproof-spec` when the env var and sibling clone are absent (matches handwritten-check resolution and typical CI layout).
- CI **sdk** matrix runs the delegated handwritten check only inside **`npm run ci`** (removed duplicate standalone step).
## 0.1.2 — 2026-05-04

- Add **`CHANGELOG.md`** (this file).
- **CI:** run the [IntentProof specification](https://github.com/IntentProof/intentproof-spec) Vitest conformance oracle on every push/PR (`.github/workflows/ci.yml`); fail the **`sdk`** job if **`packages/sdk/README.md`** differs from the root **`README.md`** (**`cmp`**) before **`npm run ci`**.
- **Local:** `npm run spec:conformance` via [`scripts/spec-conformance.sh`](scripts/spec-conformance.sh) (sibling clone `../intentproof-spec` or `INTENTPROOF_SPEC_ROOT`).
- **Docs:** README refresh—positioning, reference tables (`IntentProofClient`, `ExecutionEvent`, config), canonical spec section, security advisory link, version-pinned install example, JSON envelope wording; **GitHub** links for this repo use **`IntentProof/…`** casing (Releases, Security); **Project development** notes that **`packages/sdk/README.md`** mirrors the root README and **`npm run sync-readme`** keeps them aligned.
- **Metadata:** add npm keyword **`IntentProof`**; set **`repository.url`** on the workspace root and **`@intentproof/sdk`** to **`https://github.com/IntentProof/intentproof-sdk-node`** so **npm Sigstore provenance** matches GitHub (all-lowercase org path caused **422** on publish).
- **Tooling:** dev **`vitest`** / **`@vitest/coverage-v8`** **4.x**, **`typescript`** **6.x**; **`tsconfig`**: **`types: ["node"]`**, **`ignoreDeprecations": "6.0"`** (TS 6 globals + **`tsup`** DTS).
- **Tests / automation:** **`snapshot`** and **`BoundedQueueExporter`** adjustments for Vitest 4 V8 branch coverage at **100%**; Dependabot drops major **`ignore`** rules for Vitest, coverage, and TypeScript.
- **DX:** root **`npm run sync-readme`** (delegates to **`@intentproof/sdk`**); **`prepack`** / SDK **`ci`** still run **`sync-readme`** so **`npm pack`** and local CI refresh **`packages/sdk/README.md`**.

## 0.1.1 — 2026-05-04

- Public **npm** package **`@intentproof/sdk`**: `wrap` / `configure`, **`ExecutionEvent`** emission, memory and HTTP exporters, async correlation, and Vitest test suite.
