# Changelog

Repository: [IntentProof Node SDK (`intentproof-sdk-node`)](https://github.com/IntentProof/intentproof-sdk-node).

All notable changes to this repository are documented here. The publishable package is **`@intentproof/sdk`** in [`packages/sdk`](packages/sdk/) (SemVer on npm). Git release tags use **`vMAJOR.MINOR.PATCH`** (see [`.github/workflows/release.yml`](.github/workflows/release.yml)).

## Unreleased

- **CI artifacts:** upload conformance certificate artifacts
  (`conformance-certificate-node`) alongside conformance reports so attestation
  outputs are directly visible from workflow runs.
- **README visibility:** add CI/package/release badges and document where to
  find conformance report/certificate artifacts in CI.

## 0.1.3 — 2026-05-06

- **Spec pinning + parity hardening:** add and enforce
  `intentproofSpecCommit`/`intentproofSpecVersion` in root and package manifests;
  delegate pin checks to the spec repo; require pinned spec checkout in CI and
  release.
- **Generated artifact governance:** add `spec_fingerprint.json` generation and
  coverage; fail generated-type verification on untracked output; enforce no
  bundled schemas and no handwritten wire model types through shared guards.
- **CI/release improvements:** tighten required check sets, remove duplicate
  handwritten-model checks from matrix jobs, and upload conformance report
  artifacts with standardized SDK metadata.
- **Parity bootstrap fix:** run `npm ci` inside
  `scripts/verify-generated-types.sh` so parity codegen/format checks have all
  dependencies in clean runners.
- **Docs:** refresh README/CONTRIBUTING terminology cross-links for spec-root and
  pinning conventions.
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
