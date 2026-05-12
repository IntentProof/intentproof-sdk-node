import { canonicalize } from 'json-canonicalize';
import * as ed from '@noble/ed25519';
import { ulid } from 'ulid';
import { AsyncLocalStorage } from 'async_hooks';
import { Outbox } from './outbox';

const correlationStorage = new AsyncLocalStorage<string>();

export function runWithCorrelationId<T>(id: string, fn: () => T): T {
  return correlationStorage.run(id, fn);
}

const instancePrivateKey = require('crypto').randomBytes(32);
const instanceId = 'inst_' + ulid();
const tenantId = 'tnt_acme';
let outbox: Outbox;

export function configure(options: { dbPath: string }) {
  outbox = new Outbox(options.dbPath);
}

let chainPositions: Record<string, number> = {};
let prevHashes: Record<string, string> = {};

export function wrap<T extends (...args: any[]) => any>(
  options: { intent: string, action: string },
  fn: T
) {
  return async function(...args: Parameters<T>): Promise<ReturnType<T>> {
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

    const chainPos = (chainPositions[correlationId] || 0) + 1;
    chainPositions[correlationId] = chainPos;
    const prevHash = prevHashes[correlationId] || 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

    const event: any = {
      schema: "intentproof.event.v1",
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
      spec_version: "1.0.0",
      sdk_version: "node@1.0.0"
    };

    const canonicalBytes = new TextEncoder().encode(canonicalize(event));
    const hash = await crypto.subtle.digest('SHA-256', canonicalBytes);
    const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const sig = await ed.signAsync(new Uint8Array(hash), instancePrivateKey);
    const sigBase64 = Buffer.from(sig).toString('base64');
    
    event.signature = {
      alg: "ed25519",
      key_id: `${instanceId}:k1`,
      value: sigBase64
    };

    prevHashes[correlationId] = `sha256:${hashHex}`;

    if (outbox) {
      await outbox.append(eventId, event);
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
