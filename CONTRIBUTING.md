# Contributing

Cross-repository **pins**, **`INTENTPROOF_*`** environment variables, and script naming are documented in the **[`intentproof-spec` CONTRIBUTING guide](https://github.com/IntentProof/intentproof-spec/blob/main/CONTRIBUTING.md#terminology-shared-with-sdk-repos)**.

From the repository root:

```bash
npm ci
npm run ci
```

Parity with Node **22** and **24** matches `.github/workflows/ci.yml`. Releases (semver git tags) run **`release.yml`** (npm provenance).

For undisclosed security issues, use this repository’s [**Security**](https://github.com/IntentProof/intentproof-sdk-node/security) advisories.
