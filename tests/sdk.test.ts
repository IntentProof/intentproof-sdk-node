import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  configure,
  wrap,
  runWithCorrelationId,
  getOutbox,
  getInstanceId,
  getPublicKey,
  flush,
} from '../src/index';

describe('SDK', () => {
  let tmpDir: string;
  let dbPath: string;
  let dataDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    dataDir = path.join(tmpDir, 'data');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('requires configure before reading instance metadata', async () => {
    const clientPath = require.resolve('../src/client');
    delete require.cache[clientPath];
    delete require.cache[require.resolve('../src/index')];
    const freshClient = require('../src/client') as typeof import('../src/client');

    assert.throws(
      () => freshClient.getInstanceId(),
      /SDK not configured: call configure\(\) before getInstanceId\(\)/
    );
    await assert.rejects(
      () => freshClient.getPublicKey(),
      /SDK not configured: call configure\(\) before getPublicKey\(\)/
    );
    assert.throws(
      () => freshClient.getPrivateKey(),
      /SDK not configured: call configure\(\) before getPrivateKey\(\)/
    );
    assert.throws(
      () => freshClient.getOutbox(),
      /SDK not configured: call configure\(\) before getOutbox\(\)/
    );
    assert.throws(
      () => freshClient.getTenantId(),
      /SDK not configured: call configure\(\) before getTenantId\(\)/
    );
  });

  it('creates nested dataDir on first configure', () => {
    const nestedDir = path.join(tmpDir, 'nested', 'sdk-data');
    configure({ dbPath, dataDir: nestedDir, tenantId: 'tnt_a' });
    assert.ok(fs.existsSync(nestedDir));
    assert.ok(fs.existsSync(path.join(nestedDir, 'keypair.json')));
  });

  it('defaults tenant id when tenantId and env are unset', async () => {
    const prevTenant = process.env.INTENTPROOF_TENANT_ID;
    delete process.env.INTENTPROOF_TENANT_ID;
    try {
      configure({ dbPath, dataDir });
      const fn = wrap(
        { intent: 'Test', action: 'test.tenant_default' },
        async (x: number) => x
      );
      await runWithCorrelationId('corr-tenant-default', async () => {
        await fn(1);
      });
      assert.strictEqual(getOutbox().getEvents()[0].tenant_id, 'tnt_default');
    } finally {
      if (prevTenant === undefined) {
        delete process.env.INTENTPROOF_TENANT_ID;
      } else {
        process.env.INTENTPROOF_TENANT_ID = prevTenant;
      }
    }
  });

  it('loads an existing keypair from disk', () => {
    const crypto = require('crypto');
    const kp = {
      privateKey: Buffer.from(crypto.randomBytes(32)).toString('base64'),
      instanceId: 'inst_existing',
    };
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'keypair.json'), JSON.stringify(kp), {
      mode: 0o600,
    });
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    assert.strictEqual(getInstanceId(), 'inst_existing');
  });

  it('uses INTENTPROOF_TENANT_ID when tenantId is omitted', async () => {
    const prevTenant = process.env.INTENTPROOF_TENANT_ID;
    process.env.INTENTPROOF_TENANT_ID = 'tnt_from_env';
    try {
      configure({ dbPath, dataDir });
      const fn = wrap(
        { intent: 'Test', action: 'test.tenant_env' },
        async (x: number) => x
      );
      await runWithCorrelationId('corr-tenant-env', async () => {
        await fn(1);
      });
      assert.strictEqual(getOutbox().getEvents()[0].tenant_id, 'tnt_from_env');
    } finally {
      if (prevTenant === undefined) {
        delete process.env.INTENTPROOF_TENANT_ID;
      } else {
        process.env.INTENTPROOF_TENANT_ID = prevTenant;
      }
    }
  });

  it('auto-generates correlation ids outside runWithCorrelationId', async () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const fn = wrap(
      { intent: 'Test', action: 'test.auto_corr' },
      async (x: number) => x
    );
    await fn(1);
    const correlationId = getOutbox().getEvents()[0].correlation_id;
    assert.match(correlationId, /^req_/);
  });

  it('flush is a no-op when ingest export is not configured', async () => {
    const prevURL = process.env.INTENTPROOF_INGEST_URL;
    const prevLocal = process.env.INTENTPROOF_USE_LOCAL_INGEST;
    delete process.env.INTENTPROOF_INGEST_URL;
    delete process.env.INTENTPROOF_USE_LOCAL_INGEST;
    try {
      configure({ dbPath, dataDir, tenantId: 'tnt_a' });
      await flush();
    } finally {
      if (prevURL === undefined) {
        delete process.env.INTENTPROOF_INGEST_URL;
      } else {
        process.env.INTENTPROOF_INGEST_URL = prevURL;
      }
      if (prevLocal === undefined) {
        delete process.env.INTENTPROOF_USE_LOCAL_INGEST;
      } else {
        process.env.INTENTPROOF_USE_LOCAL_INGEST = prevLocal;
      }
    }
  });

  it('persists keypair across configure calls', async () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const id1 = getInstanceId();
    const pub1 = await getPublicKey();

    // Simulate restart: re-configure with same dataDir.
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const id2 = getInstanceId();
    const pub2 = await getPublicKey();

    assert.strictEqual(id1, id2, 'instance_id must be stable across restarts');
    assert.deepStrictEqual(pub1, pub2, 'public key must be stable across restarts');
  });

  it('generates a new keypair for a fresh dataDir', async () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const id1 = getInstanceId();

    const freshDir = path.join(tmpDir, 'fresh');
    configure({ dbPath, dataDir: freshDir, tenantId: 'tnt_a' });
    const id2 = getInstanceId();

    assert.notStrictEqual(id1, id2, 'different dataDir must yield different instance_id');
  });

  it('produces a signed event with correct prev_event_hash', async () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const fn = wrap(
      { intent: 'Test', action: 'test.action' },
      async (x: number) => x * 2
    );

    await runWithCorrelationId('corr-1', async () => {
      await fn(5);
    });

    const events = getOutbox().getEvents();
    assert.strictEqual(events.length, 1, 'one event should be stored');

    const ev = events[0];
    assert.strictEqual(ev.chain_position, 1, 'first event has chain_position 1');
    assert.strictEqual(
      ev.prev_event_hash,
      'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      'first event prev_hash is sentinel'
    );
    assert.ok(ev.signature, 'event must have a signature');
    assert.strictEqual(ev.signature.alg, 'ed25519');
    assert.ok(ev.signature.value, 'signature value must be present');
    assert.strictEqual(ev.provenance_class, 'sdk_attested_evidence');
    assert.strictEqual(ev.untrusted_payload, true);
  });

  it('maintains chain continuity across restarts', async () => {
    // First session: produce one event.
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const fn = wrap(
      { intent: 'Test', action: 'test.action' },
      async (x: number) => x * 2
    );

    await runWithCorrelationId('corr-2', async () => {
      await fn(1);
    });

    const ev1 = getOutbox().getEvents()[0];
    assert.strictEqual(ev1.chain_position, 1);

    // Simulate restart.
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const fn2 = wrap(
      { intent: 'Test', action: 'test.action' },
      async (x: number) => x * 2
    );

    await runWithCorrelationId('corr-2', async () => {
      await fn2(2);
    });

    const events = getOutbox().getEvents();
    assert.strictEqual(events.length, 2, 'two events total');

    const ev2 = events.find((e: any) => e.chain_position === 2);
    assert.ok(ev2, 'event with chain_position 2 must exist');
    assert.strictEqual(ev2.chain_position, 2, 'second event has chain_position 2');
    assert.ok(
      ev2.prev_event_hash.startsWith('sha256:'),
      'prev_event_hash must be a sha256 hash'
    );
    assert.notStrictEqual(
      ev2.prev_event_hash,
      'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      'second event must reference first event hash, not sentinel'
    );
  });

  it('preserves correlation isolation', async () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const fn = wrap(
      { intent: 'Test', action: 'test.action' },
      async (x: number) => x * 2
    );

    await runWithCorrelationId('corr-a', async () => {
      await fn(1);
    });
    await runWithCorrelationId('corr-b', async () => {
      await fn(2);
    });

    const events = getOutbox().getEvents();
    assert.strictEqual(events.length, 2);

    const evA = events.find((e: any) => e.correlation_id === 'corr-a');
    const evB = events.find((e: any) => e.correlation_id === 'corr-b');

    assert.ok(evA, 'event for corr-a exists');
    assert.ok(evB, 'event for corr-b exists');
    assert.strictEqual(evA.chain_position, 1);
    assert.strictEqual(evB.chain_position, 1);
    assert.strictEqual(
      evA.prev_event_hash,
      'sha256:0000000000000000000000000000000000000000000000000000000000000000'
    );
    assert.strictEqual(
      evB.prev_event_hash,
      'sha256:0000000000000000000000000000000000000000000000000000000000000000'
    );
  });

  it('produces a verifiable Ed25519 signature', async () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const fn = wrap(
      { intent: 'Test', action: 'test.action' },
      async (x: number) => x * 2
    );

    await runWithCorrelationId('corr-verify', async () => {
      await fn(7);
    });

    const events = getOutbox().getEvents();
    const ev = events.find((e: any) => e.correlation_id === 'corr-verify');
    assert.ok(ev, 'event exists');

    // Verify the signature cryptographically.
    const { canonicalizeIntentProof } = require('../src/canon');
    const evCopy = { ...ev };
    delete evCopy.signature;
    const canonicalBytes = new TextEncoder().encode(canonicalizeIntentProof(evCopy));
    const hash = await crypto.subtle.digest('SHA-256', canonicalBytes);

    const pub = await getPublicKey();
    const sig = Buffer.from(ev.signature.value, 'base64');
    const ed = require('@noble/ed25519');
    const valid = await ed.verifyAsync(sig, new Uint8Array(hash), pub);
    assert.strictEqual(valid, true, 'signature must verify against public key');
  });

  it('records failed wrapped calls and preserves the thrown error message', async () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const fn = wrap(
      { intent: 'Failing call', action: 'test.error' },
      async () => {
        throw new Error('customer failure');
      }
    );

    await assert.rejects(
      () => runWithCorrelationId('corr-error', async () => fn()),
      /customer failure/
    );

    const events = getOutbox().getEvents();
    assert.strictEqual(events.length, 1, 'failed call should still be stored');
    assert.strictEqual(events[0].status, 'error');
    assert.deepStrictEqual(events[0].error, { message: 'customer failure' });
    assert.strictEqual(events[0].output, null);
  });
});
