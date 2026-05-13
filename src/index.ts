import { canonicalize } from 'json-canonicalize';
import * as ed from '@noble/ed25519';
import { ulid } from 'ulid';
import { AsyncLocalStorage } from 'async_hooks';
import { Outbox } from './outbox';
import * as fs from 'fs';
import * as path from 'path';

const correlationStorage = new AsyncLocalStorage<string>();

export function runWithCorrelationId<T>(id: string, fn: () => T): T {
  return correlationStorage.run(id, fn);
}

interface Keypair {
  privateKey: string; // base64
  instanceId: string;
}

let instancePrivateKey: Uint8Array;
let instanceId: string;
let tenantId: string;
let outbox: Outbox;
let dataDir: string;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadOrCreateKeypair(dir: string): Keypair {
  const keyPath = path.join(dir, 'keypair.json');
  if (fs.existsSync(keyPath)) {
    const raw = fs.readFileSync(keyPath, 'utf-8');
    return JSON.parse(raw) as Keypair;
  }
  const privateKey = require('crypto').randomBytes(32);
  const kp: Keypair = {
    privateKey: Buffer.from(privateKey).toString('base64'),
    instanceId: 'inst_' + ulid(),
  };
  fs.writeFileSync(keyPath, JSON.stringify(kp, null, 2));
  return kp;
}

export function configure(options: { dbPath: string; tenantId?: string; dataDir?: string }) {
  dataDir = options.dataDir || path.join(require('os').homedir(), '.intentproof', 'sdk-node');
  ensureDir(dataDir);

  const kp = loadOrCreateKeypair(dataDir);
  instancePrivateKey = new Uint8Array(Buffer.from(kp.privateKey, 'base64'));
  instanceId = kp.instanceId;
  tenantId = options.tenantId || 'tnt_default';

  outbox = new Outbox(options.dbPath);
}

export function wrap<T extends (...args: any[]) => any>(
  options: { intent: string; action: string },
  fn: T
) {
  return async function (...args: Parameters<T>): Promise<ReturnType<T>> {
    const t0 = Date.now();
    const correlationId = correlationStorage.getStore() || 'req_' + ulid();
    const eventId = ulid();

    let result;
    let status: 'ok' | 'error' = 'ok';
    let errorObj = null;
    let reraise = false;

    try {
      result = await fn(...args);
    } catch (e: any) {
      status = 'error';
      errorObj = { message: e.message };
      reraise = true;
    }
    const t1 = Date.now();

    // Load chain state from DB (or use defaults for new correlation).
    let chainPos = 1;
    let prevHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
    if (outbox) {
      const state = outbox.getChainState(correlationId);
      if (state) {
        chainPos = state.position + 1;
        prevHash = state.hash;
      }
    }

    const event: any = {
      schema: 'intentproof.event.v1',
      event_id: eventId,
      tenant_id: tenantId,
      instance_id: instanceId,
      correlation_id: correlationId,
      prev_event_hash: prevHash,
      chain_position: chainPos,
      intent: options.intent,
      action: options.action,
      status: status,
      started_at: new Date(t0).toISOString(),
      completed_at: new Date(t1).toISOString(),
      duration_ms: t1 - t0,
      inputs: args,
      output: status === 'ok' ? result : null,
      error: errorObj,
      attributes: {},
      spec_version: '1.0.0',
      sdk_version: 'node@1.0.0',
    };

    const canonicalBytes = new TextEncoder().encode(canonicalize(event));
    const hash = await crypto.subtle.digest('SHA-256', canonicalBytes);
    const hashHex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const sig = await ed.signAsync(new Uint8Array(hash), instancePrivateKey);
    const sigBase64 = Buffer.from(sig).toString('base64');

    event.signature = {
      alg: 'ed25519',
      key_id: `${instanceId}:k1`,
      value: sigBase64,
    };

    const eventHash = `sha256:${hashHex}`;

    if (outbox) {
      outbox.append(eventId, event);
      outbox.setChainState(correlationId, chainPos, eventHash);
    }

    if (reraise) {
      throw errorObj;
    }
    return result;
  };
}

export function getOutbox() {
  return outbox;
}

export function getInstanceId() {
  return instanceId;
}

export function getPublicKey(): Promise<Uint8Array> {
  return ed.getPublicKeyAsync(instancePrivateKey);
}
