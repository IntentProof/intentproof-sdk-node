import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HttpExporter, ingestRequestHeaders, resolveIngestURL } from '../src/exporter';
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

  it('ingestRequestHeaders omits Authorization when token is unset', () => {
    const prev = process.env.INTENTPROOF_INGEST_TOKEN;
    delete process.env.INTENTPROOF_INGEST_TOKEN;
    try {
      assert.strictEqual(ingestRequestHeaders().Authorization, undefined);
    } finally {
      if (prev !== undefined) {
        process.env.INTENTPROOF_INGEST_TOKEN = prev;
      }
    }
  });

  it('ingestRequestHeaders includes bearer token when configured', () => {
    const prev = process.env.INTENTPROOF_INGEST_TOKEN;
    process.env.INTENTPROOF_INGEST_TOKEN = 'ingest-secret';
    try {
      assert.strictEqual(
        ingestRequestHeaders().Authorization,
        'Bearer ingest-secret'
      );
    } finally {
      if (prev === undefined) {
        delete process.env.INTENTPROOF_INGEST_TOKEN;
      } else {
        process.env.INTENTPROOF_INGEST_TOKEN = prev;
      }
    }
  });

  it('resolveIngestURL reads INTENTPROOF_INGEST_URL from the environment', () => {
    const prevURL = process.env.INTENTPROOF_INGEST_URL;
    process.env.INTENTPROOF_INGEST_URL = 'http://127.0.0.1:9787';
    try {
      assert.strictEqual(
        resolveIngestURL(),
        'http://127.0.0.1:9787/v1/events'
      );
    } finally {
      if (prevURL === undefined) {
        delete process.env.INTENTPROOF_INGEST_URL;
      } else {
        process.env.INTENTPROOF_INGEST_URL = prevURL;
      }
    }
  });

  it('resolveIngestURL returns null when ingest is not configured', () => {
    const prevURL = process.env.INTENTPROOF_INGEST_URL;
    const prevLocal = process.env.INTENTPROOF_USE_LOCAL_INGEST;
    delete process.env.INTENTPROOF_INGEST_URL;
    delete process.env.INTENTPROOF_USE_LOCAL_INGEST;
    try {
      assert.strictEqual(resolveIngestURL(), null);
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

  it('accepts HTTP 200 ingest responses', async () => {
    const okServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/events') {
        req.resume();
        res.writeHead(200);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      okServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = okServer.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('no server address');
    }

    try {
      const exporter = new HttpExporter(`http://127.0.0.1:${addr.port}/v1/events`);
      exporter.enqueue({ event_id: 'evt_ok' });
      await exporter.flush();
    } finally {
      await new Promise<void>((resolve) => okServer.close(() => resolve()));
    }
  });

  it('logs non-2xx ingest responses with an empty body', async () => {
    const warnings: string[] = [];
    const prevWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    const emptyBodyServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/events') {
        req.resume();
        res.writeHead(503);
        res.end();
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      emptyBodyServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = emptyBodyServer.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('no server address');
    }

    try {
      const exporter = new HttpExporter(`http://127.0.0.1:${addr.port}/v1/events`);
      exporter.enqueue({ event_id: 'evt_empty_body' });
      await exporter.flush();
      assert.match(warnings.join('\n'), /ingest POST 503/);
    } finally {
      console.warn = prevWarn;
      await new Promise<void>((resolve) => emptyBodyServer.close(() => resolve()));
    }
  });

  it('logs non-2xx ingest responses without throwing', async () => {
    const warnings: string[] = [];
    const prevWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    const failingServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/events') {
        req.resume();
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('boom');
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      failingServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = failingServer.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('no server address');
    }

    try {
      const exporter = new HttpExporter(`http://127.0.0.1:${addr.port}/v1/events`);
      exporter.enqueue({ event_id: 'evt_failure' });
      await exporter.flush();
      assert.match(warnings.join('\n'), /ingest POST 500: boom/);
    } finally {
      console.warn = prevWarn;
      await new Promise<void>((resolve) => failingServer.close(() => resolve()));
    }
  });

  it('logs network failures from non-Error rejections', async () => {
    const warnings: string[] = [];
    const prevWarn = console.warn;
    const prevFetch = global.fetch;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };
    global.fetch = (() => Promise.reject('network down')) as typeof fetch;

    try {
      const exporter = new HttpExporter('http://127.0.0.1:9787/v1/events');
      exporter.enqueue({ event_id: 'evt_network' });
      await exporter.flush();
      assert.match(warnings.join('\n'), /network down/);
    } finally {
      console.warn = prevWarn;
      global.fetch = prevFetch;
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

  it('POSTs signed events with ingest bearer token when configured', async () => {
    const prevToken = process.env.INTENTPROOF_INGEST_TOKEN;
    process.env.INTENTPROOF_INGEST_TOKEN = 'ingest-secret';
    let authHeader = '';
    const authedServer = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/events') {
        authHeader = req.headers.authorization ?? '';
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          res.writeHead(202);
          res.end();
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => {
      authedServer.listen(0, '127.0.0.1', () => resolve());
    });
    const authedAddr = authedServer.address();
    if (!authedAddr || typeof authedAddr === 'string') {
      throw new Error('no server address');
    }
    const authedURL = `http://127.0.0.1:${authedAddr.port}/v1/events`;
    try {
      configure({
        dbPath: path.join(tmpDir, 'outbox-auth.db'),
        dataDir: path.join(tmpDir, 'data-auth'),
        tenantId: 'tnt_test',
        ingestUrl: authedURL,
      });
      const fn = wrap(
        { intent: 'Export', action: 'export.auth' },
        async (n: number) => n + 1
      );
      await runWithCorrelationId('corr-export-auth', async () => {
        await fn(1);
      });
      await flush();
      assert.strictEqual(authHeader, 'Bearer ingest-secret');
    } finally {
      await new Promise<void>((resolve) => authedServer.close(() => resolve()));
      if (prevToken === undefined) {
        delete process.env.INTENTPROOF_INGEST_TOKEN;
      } else {
        process.env.INTENTPROOF_INGEST_TOKEN = prevToken;
      }
    }
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
