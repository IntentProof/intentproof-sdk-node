import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveIngestURL } from '../src/exporter';
import { configure, wrap, runWithCorrelationId, flush } from '../src/index';

describe('exporter', () => {
  it('resolveIngestURL normalizes base URLs', () => {
    assert.strictEqual(
      resolveIngestURL('http://127.0.0.1:9787'),
      'http://127.0.0.1:9787/v1/events'
    );
    assert.strictEqual(
      resolveIngestURL('http://127.0.0.1:9787/v1/events'),
      'http://127.0.0.1:9787/v1/events'
    );
    assert.strictEqual(
      resolveIngestURL('http://127.0.0.1:9787/v1/events/'),
      'http://127.0.0.1:9787/v1/events'
    );
  });

  it('resolveIngestURL uses INTENTPROOF_USE_LOCAL_INGEST', () => {
    const prev = process.env.INTENTPROOF_USE_LOCAL_INGEST;
    const prevURL = process.env.INTENTPROOF_INGEST_URL;
    delete process.env.INTENTPROOF_INGEST_URL;
    process.env.INTENTPROOF_USE_LOCAL_INGEST = '1';
    try {
      assert.strictEqual(
        resolveIngestURL(),
        'http://127.0.0.1:9787/v1/events'
      );
    } finally {
      if (prev === undefined) {
        delete process.env.INTENTPROOF_USE_LOCAL_INGEST;
      } else {
        process.env.INTENTPROOF_USE_LOCAL_INGEST = prev;
      }
      if (prevURL === undefined) {
        delete process.env.INTENTPROOF_INGEST_URL;
      } else {
        process.env.INTENTPROOF_INGEST_URL = prevURL;
      }
    }
  });
});

describe('HTTP export from wrap()', () => {
  let tmpDir: string;
  let server: http.Server;
  let received: any[];
  let ingestURL: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-export-'));
    received = [];
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/events') {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          received.push(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
          res.writeHead(202);
          res.end();
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
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POSTs signed events when ingestUrl is configured', async () => {
    configure({
      dbPath: path.join(tmpDir, 'outbox.db'),
      dataDir: path.join(tmpDir, 'data'),
      tenantId: 'tnt_test',
      ingestUrl: ingestURL,
    });

    const fn = wrap(
      { intent: 'Export', action: 'export.test' },
      async (n: number) => n + 1
    );
    await runWithCorrelationId('corr-export', async () => {
      await fn(1);
    });
    await flush();

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].tenant_id, 'tnt_test');
    assert.strictEqual(received[0].correlation_id, 'corr-export');
    assert.ok(received[0].signature?.value);
  });
});
