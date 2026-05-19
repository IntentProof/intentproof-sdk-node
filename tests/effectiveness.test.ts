import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as client from '../src/client';
import {
  configure,
  wrap,
  runWithCorrelationId,
  flush,
  getOutbox,
  pushSubjectMapping,
  eventContentHash,
} from '../src/index';
import { assertValidExecutionEvent } from './helpers/spec_schema';

describe('SDK effectiveness', () => {
  let tmpDir: string;
  let dbPath: string;
  let dataDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-effective-'));
    dbPath = path.join(tmpDir, 'test.db');
    dataDir = path.join(tmpDir, 'data');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('links prev_event_hash to the prior event content hash', async () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const fn = wrap(
      { intent: 'Chain', action: 'test.chain' },
      async (x: number) => x
    );

    await runWithCorrelationId('corr-chain', async () => {
      await fn(1);
      await fn(2);
    });

    const events = getOutbox().getEvents() as Record<string, unknown>[];
    assert.strictEqual(events.length, 2);
    const ev1 = events.find((e) => e.chain_position === 1)!;
    const ev2 = events.find((e) => e.chain_position === 2)!;
    assert.strictEqual(ev2.prev_event_hash, eventContentHash(ev1));
  });

  it('pushSubjectMapping is a documented no-op stub', () => {
    assert.doesNotThrow(() =>
      pushSubjectMapping('stripe@webhook', 'stripe_refund', 're_123')
    );
  });

  it('exposes configured exporter and tenant metadata', () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_meta', ingestUrl: 'http://127.0.0.1:9787' });
    assert.strictEqual(client.getTenantId(), 'tnt_meta');
    assert.ok(client.getExporter());
  });

  it('client.configure accepts redactKeys for forward compatibility', () => {
    configure({
      dbPath,
      dataDir,
      tenantId: 'tnt_a',
      redactKeys: ['password', 'secret*'],
    });
    assert.deepStrictEqual(client.getRedactKeys(), ['password', 'secret*']);
  });

  it('surfaces outbox failures for successful wrapped calls', async () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const outbox = getOutbox();
    outbox.append = () => {
      throw new Error('outbox unavailable');
    };

    const fn = wrap(
      { intent: 'Record fail', action: 'test.record_fail_ok' },
      async () => 'ok'
    );

    await assert.rejects(
      () => fn(),
      /outbox unavailable/
    );
  });

  it('preserves app errors when outbox recording fails', async () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const outbox = getOutbox();
    const originalAppend = outbox.append.bind(outbox);
    outbox.append = () => {
      throw new Error('outbox unavailable');
    };

    const fn = wrap(
      { intent: 'Fail record', action: 'test.record_fail' },
      async () => {
        throw new Error('boom');
      }
    );

    await assert.rejects(
      async () => {
        await fn();
      },
      (err: Error) => {
        assert.match(err.message, /boom/);
        assert.ok(err.cause instanceof Error);
        assert.match((err.cause as Error).message, /outbox unavailable/);
        return true;
      }
    );

    outbox.append = originalAppend;
  });

  it('sets untrusted_payload false when nothing is captured', async () => {
    configure({ dbPath, dataDir, tenantId: 'tnt_a' });
    const fn = wrap(
      { intent: 'No payload', action: 'test.no_payload' },
      async () => undefined
    );
    await fn();
    assert.strictEqual(getOutbox().getEvents()[0].untrusted_payload, false);
  });

  it('retains outbox events when HTTP export fails', async () => {
    const warnings: string[] = [];
    const prevWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    configure({
      dbPath,
      dataDir,
      tenantId: 'tnt_a',
      ingestUrl: 'http://127.0.0.1:1/v1/events',
    });

    const fn = wrap(
      { intent: 'Export fail', action: 'test.export_fail' },
      async (n: number) => n
    );
    await runWithCorrelationId('corr-export-fail', async () => {
      await fn(1);
    });
    await flush();

    const events = getOutbox().getEvents();
    assert.strictEqual(events.length, 1);
    assert.match(warnings.join('\n'), /ingest export failed/);
    assertValidExecutionEvent(events[0] as Record<string, unknown>);

    console.warn = prevWarn;
  });
});
