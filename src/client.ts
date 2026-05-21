/**
 * SDK runtime configuration and shared state.
 */

import fs from 'fs';
import path from 'path';
import { ulid } from 'ulid';
import { HttpExporter, resolveIngestURL } from './exporter';
import { Outbox } from './outbox';
import { loadPrivateKey } from './signing';

export const SDK_VERSION = 'node@0.2.0';

interface Keypair {
  privateKey: string;
  instanceId: string;
}

let instancePrivateKey: Uint8Array;
let instanceId: string;
let tenantId: string;
let outbox: Outbox;
let exporter: HttpExporter | null = null;
let dataDir: string;
let redactKeys: string[] = [];

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadOrCreateKeypair(dir: string): Keypair {
  const keyPath = path.join(dir, 'keypair.json');
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, 'utf-8');
    fs.chmodSync(keyPath, 0o600);
    return JSON.parse(raw) as Keypair;
  }
  const privateKey = require('crypto').randomBytes(32);
  const kp: Keypair = {
    privateKey: Buffer.from(privateKey).toString('base64'),
    instanceId: 'inst_' + ulid(),
  };
  fs.writeFileSync(keyPath, JSON.stringify(kp, null, 2), { mode: 0o600 });
  return kp;
}

export function configure(options: {
  dbPath: string;
  tenantId?: string;
  dataDir?: string;
  ingestUrl?: string;
  redactKeys?: string[];
}): void {
  if (exporter) {
    void exporter.flush();
  }

  dataDir =
    options.dataDir ||
    path.join(require('os').homedir(), '.intentproof', 'sdk-node');
  ensureDir(dataDir);

  const kp = loadOrCreateKeypair(dataDir);
  instancePrivateKey = loadPrivateKey(kp.privateKey);
  instanceId = kp.instanceId;
  tenantId =
    options.tenantId ||
    process.env.INTENTPROOF_TENANT_ID?.trim() ||
    'tnt_default';
  redactKeys = options.redactKeys ?? [];

  outbox = new Outbox(options.dbPath);

  const ingestURL = resolveIngestURL(options.ingestUrl);
  exporter = ingestURL ? new HttpExporter(ingestURL) : null;
}

export async function flush(): Promise<void> {
  if (exporter) {
    await exporter.flush();
  }
}

export function getOutbox(): Outbox {
  if (!outbox) {
    throw new Error('SDK not configured: call configure() before getOutbox()');
  }
  return outbox;
}

export function getInstanceId(): string {
  if (!instanceId) {
    throw new Error('SDK not configured: call configure() before getInstanceId()');
  }
  return instanceId;
}

export function getTenantId(): string {
  if (!tenantId) {
    throw new Error('SDK not configured: call configure() before getTenantId()');
  }
  return tenantId;
}

export function getPublicKey(): Promise<Uint8Array> {
  if (!instancePrivateKey) {
    return Promise.reject(
      new Error('SDK not configured: call configure() before getPublicKey()')
    );
  }
  const { getPublicKeyAsync } = require('@noble/ed25519') as typeof import('@noble/ed25519');
  return getPublicKeyAsync(instancePrivateKey);
}

export function getPrivateKey(): Uint8Array {
  if (!instancePrivateKey) {
    throw new Error('SDK not configured: call configure() before getPrivateKey()');
  }
  return instancePrivateKey;
}

export function getExporter(): HttpExporter | null {
  return exporter;
}

export function getRedactKeys(): string[] {
  return [...redactKeys];
}
