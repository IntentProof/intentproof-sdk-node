# intentproof-sdk-node

[![CI](https://github.com/IntentProof/intentproof-sdk-node/actions/workflows/ci.yml/badge.svg)](https://github.com/IntentProof/intentproof-sdk-node/actions/workflows/ci.yml)

Node.js SDK for signing IntentProof `ExecutionEvent` records locally.

## Use

- `wrap(intent, action, fn)` instrumentation
- Ed25519 signing and JCS canonicalization
- SQLite outbox for durable local capture
- Export events to your app or bundle pipeline

## Install

```bash
npm install @intentproof/sdk
```

Development in this repo:

```bash
npm install
npm run build
npm test
```

Conformance vectors live in
[`intentproof-spec`](https://github.com/IntentProof/intentproof-spec).

## Quick start

```typescript
import { configure, wrap, flush } from '@intentproof/sdk';

configure({
  dbPath: './intentproof-outbox.db',
  dataDir: './.intentproof-sdk',
});

const refund = wrap(
  'Return funds to the customer',
  'payments.refund.execute',
  async (input) => ({ id: 're_123' }),
);

await refund({ amount_cents: 4999 });
await flush();
```

Signing keys default to `~/.intentproof/sdk-node/keypair.json` when `dataDir`
is omitted. Delete that directory to reset the local identity.

Optional: run `intentproof local` from
[`intentproof-tools`](https://github.com/IntentProof/intentproof-tools) for a
loopback dev ingest — not required for offline verification.

## Support

[GitHub Issues](https://github.com/IntentProof/intentproof-sdk-node/issues) —
see [CONTRIBUTING.md](CONTRIBUTING.md). Security:
[SECURITY.md](SECURITY.md).

## License

MIT — see [LICENSE](LICENSE) and [TRADEMARK.md](TRADEMARK.md).
