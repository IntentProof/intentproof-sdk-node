# intentproof-sdk-node

Node.js SDK for emitting signed `ExecutionEvent` records to IntentProof.

## Scope

- `wrap(intent, action, fn)` instrumentation helper
- Correlation-id helpers
- Event signing and canonical serialization
- Local outbox support
- HTTP export to ingest when `INTENTPROOF_INGEST_URL` is set

## Quick start

1. Install deps: `npm install`
2. Build/test with project scripts.
3. Start local ingest (`intentproof local`) or set hosted ingest URL:
   - `INTENTPROOF_INGEST_URL=http://127.0.0.1:9787` (appends `/v1/events`)
   - or `INTENTPROOF_USE_LOCAL_INGEST=1` for the default local URL
4. Call `flush()` before process exit to await in-flight exports.

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

Apache License 2.0 (`LICENSE`).
