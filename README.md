# intentproof-sdk-node

[![CI](https://github.com/IntentProof/intentproof-sdk-node/actions/workflows/ci.yml/badge.svg)](https://github.com/IntentProof/intentproof-sdk-node/actions/workflows/ci.yml)

Node.js SDK for emitting signed `ExecutionEvent` records to IntentProof.

## Who uses this

Node.js application authors who instrument business logic with
`wrap(intent, action, fn)` and export signed execution events to local or
hosted ingest.

## Scope

- `wrap(intent, action, fn)` instrumentation helper
- Correlation-id helpers
- Event signing and canonical serialization
- Local outbox support
- HTTP export to ingest when `INTENTPROOF_INGEST_URL` is set

## Install

```bash
npm install @intentproof/sdk
```

For development in this repository:

```bash
npm install
npm run build
```

## Verify

Cross-language signing fixtures in CI match
[`intentproof-spec`](https://github.com/IntentProof/intentproof-spec) golden
vectors. Run `npm test` locally before publishing.

## Test

```bash
npm test
npm run build
```

CI enforces lint, typecheck, and conformance coverage.

## Release

npm packages are published from maintainer release workflows in
[`intentproof-tools`](https://github.com/IntentProof/intentproof-tools) using
Sigstore-attested artifacts. See
[`docs/release-signing.md`](https://github.com/IntentProof/intentproof-tools/blob/main/docs/release-signing.md).

## Documentation hub

Per-repo README files plus
[`intentproof-infra`](https://github.com/IntentProof/intentproof-infra) for
self-host install and image verification. Docs site deferred — see
[`docs-hub-decision.md`](https://github.com/IntentProof/intentproof-infra/blob/main/docs/docs-hub-decision.md).

## Support

Report bugs, API gaps, and conformance findings via
[GitHub Issues](https://github.com/IntentProof/intentproof-sdk-node/issues).
See [`CONTRIBUTING.md`](CONTRIBUTING.md). Security reports:
[`SECURITY.md`](SECURITY.md).

## Quick start

1. Install deps: `npm install`
2. Build/test with project scripts.
3. Start local ingest (`intentproof local`) or set hosted ingest URL:
   - `INTENTPROOF_INGEST_URL=http://127.0.0.1:9787` (appends `/v1/events`)
   - or `INTENTPROOF_USE_LOCAL_INGEST=1` for the default local URL
4. For **hosted** ingest that requires bearer auth, set
   `INTENTPROOF_INGEST_TOKEN` to your tenant ingest token (sent as
   `Authorization: Bearer …` on export). Local loop ingest does not use this.
5. Call `flush()` before process exit to await in-flight exports.

## Local key and data directory

`configure()` requires an outbox database path through `dbPath`. That outbox
location is application-controlled and is not defaulted by the SDK.

If `configure()` is called without `dataDir`, the SDK stores its local signing
keypair at `~/.intentproof/sdk-node/keypair.json`. The keypair is reused across
process restarts so the same local SDK instance can continue signing a stable
event chain. Delete `~/.intentproof/sdk-node` to reset the default local SDK
identity.

Pass an explicit `dataDir` to isolate tests, demos, or applications that should
not use the default `~/.intentproof` tree:

```typescript
configure({
  dbPath: './intentproof-outbox.db',
  dataDir: './.intentproof-sdk',
});
```

When `intentproof local` is running, it imports
`~/.intentproof/sdk-node/keypair.json` if present so locally exported events can
verify without extra key-registration steps.

## License

Apache License 2.0 — see [`LICENSE`](LICENSE), [`NOTICE`](NOTICE), and
[`TRADEMARK.md`](TRADEMARK.md).
