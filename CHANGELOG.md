# Changelog

Repository: [IntentProof Node SDK (`intentproof-sdk-node`)](https://github.com/IntentProof/intentproof-sdk-node).

All notable changes to this repository are documented here. The publishable package is **`@intentproof/sdk`** in [`packages/sdk`](packages/sdk/) (SemVer on npm). Git release tags use **`vMAJOR.MINOR.PATCH`** (see [`.github/workflows/release.yml`](.github/workflows/release.yml)).

## Unreleased

- **Parity CI bootstrap fix:** `scripts/verify-generated-types.sh` now runs `npm ci` before code generation/format drift checks so the parity workflow has required Node dependencies (for example `json-stable-stringify`) available in fresh runners.
- **Spec-derived artifacts and guards:** Emit `packages/sdk/src/generated/spec_fingerprint.json` during typegen; add `generated_fingerprint.test.ts`; fail verify when generated output is untracked; bundled-schema policy rejects stray `*.schema.json`; delegate `check-no-handwritten-model-types.sh` to the shared spec checker; import `JsonValue` from `generated/execution-event.ts` in `client.ts` (not `types.ts`).
- **Pinned spec revision:** Add **`intentproofSpecCommit`** to root and **`packages/sdk`** **`package.json`**; CI and release check out that SHA (`ref`, `fetch-depth: 0`). **`scripts/check-sdk-spec-pin.sh`** execs **`intentproof-spec/scripts/check-sdk-spec-pins.sh`**. **`npm run ci`** runs the pin check first when **`INTENTPROOF_SPEC_ROOT`** is set. **`scripts/spec-conformance.sh`** resolves sibling **`../intentproof-spec`**, env **`INTENTPROOF_SPEC_ROOT`**, or in-repo **`./intentproof-spec`**.
- **CI and release:** Concurrency cancels superseded runs on the same PR/ref. **`hardening`** job and release preflight require **`hardening`**, **`intentproof-spec`**, **`sdk (22)`**, **`sdk (24)`**. Conformance job sets **`INTENTPROOF_SDK_*`** metadata, uploads **`intentproof-spec/conformance-report.json`** as **`conformance-report-node`** via **`actions/upload-artifact@v7`**. Release checks out pinned spec, sets **`INTENTPROOF_SPEC_ROOT`**, then **`npm run ci`**. **`sdk`** matrix drops the duplicate handwritten step (check stays inside **`npm run ci`**).
- **Docs:** **[`CONTRIBUTING.md`](CONTRIBUTING.md)** and README cross-links for shared **`intentproof-spec`** terminology (**`INTENTPROOF_SPEC_ROOT`**, **`intentproofSpecCommit`**).
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
