import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { configure, wrap, runWithCorrelationId, getOutbox } from '../src/index';
import { assertValidExecutionEvent } from './helpers/spec_schema';

describe('execution event schema conformance', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-schema-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('wrap() events validate against execution_event.v1', async () => {
    configure({
      dbPath: path.join(tmpDir, 'outbox.db'),
      dataDir: path.join(tmpDir, 'data'),
      tenantId: 'tnt_schema',
    });

    const fn = wrap(
      { intent: 'Schema check', action: 'test.schema.wrap' },
      async (n: number) => n + 1
    );
    await runWithCorrelationId('corr-schema', async () => {
      await fn(2);
    });

    const event = getOutbox().getEvents()[0] as Record<string, unknown>;
    assertValidExecutionEvent(event);
    assert.strictEqual(event.provenance_class, 'sdk_attested_evidence');
    assert.strictEqual(event.untrusted_payload, true);
  });
});
