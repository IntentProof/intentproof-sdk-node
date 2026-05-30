import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { configure, wrap, runWithCorrelationId, flush } from '../src/index';
import { assertValidExecutionEvent } from './helpers/spec_schema';

/**
 * Minimal ingest contract: bearer required when ingest auth is enabled,
 * JSON execution event body, 202 Accepted on success.
 */
describe('ingest contract (local-loop shape)', () => {
  let tmpDir: string;
  let server: http.Server;
  let ingestURL: string;
  let received: Record<string, unknown>[];
  let lastStatus: number;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-ingest-contract-'));
    received = [];
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/events') {
        const auth = req.headers.authorization ?? '';
        if (!auth.startsWith('Bearer ')) {
          lastStatus = 401;
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'missing_token' }));
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<
            string,
            unknown
          >;
          try {
            assertValidExecutionEvent(body);
            received.push(body);
            lastStatus = 202;
            res.writeHead(202);
            res.end();
          } catch (err) {
            lastStatus = 400;
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: 'invalid_event',
                detail: err instanceof Error ? err.message : String(err),
              })
            );
          }
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('no server address');
    }
    ingestURL = `http://127.0.0.1:${addr.port}/v1/events`;
    lastStatus = 0;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('accepts a schema-valid signed event with bearer auth', async () => {
    const prevToken = process.env.INTENTPROOF_INGEST_TOKEN;
    process.env.INTENTPROOF_INGEST_TOKEN = 'it-test-token';
    try {
      configure({
        dbPath: path.join(tmpDir, 'outbox.db'),
        dataDir: path.join(tmpDir, 'data'),
        tenantId: 'tnt_contract',
        ingestUrl: ingestURL,
      });
      const fn = wrap(
        { intent: 'Contract', action: 'test.ingest.contract' },
        async (n: number) => n + 1
      );
      await runWithCorrelationId('corr-contract', async () => {
        await fn(3);
      });
      await flush();

      assert.strictEqual(lastStatus, 202);
      assert.strictEqual(received.length, 1);
      assert.strictEqual(received[0].tenant_id, 'tnt_contract');
      assert.strictEqual(received[0].correlation_id, 'corr-contract');
    } finally {
      if (prevToken === undefined) {
        delete process.env.INTENTPROOF_INGEST_TOKEN;
      } else {
        process.env.INTENTPROOF_INGEST_TOKEN = prevToken;
      }
    }
  });
});
