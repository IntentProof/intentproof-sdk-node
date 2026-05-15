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

## License

Apache License 2.0 (`LICENSE`).
