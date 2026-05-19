import { signAsync, verifyAsync } from '@noble/ed25519';
import { canonicalizeIntentProof } from './canon';

export const SENTINEL_PREV_HASH =
  'sha256:0000000000000000000000000000000000000000000000000000000000000000';

export function canonicalizeEvent(event: Record<string, unknown>): string {
  const unsigned = { ...event };
  delete unsigned.signature;
  return canonicalizeIntentProof(unsigned);
}

export function eventContentHash(event: Record<string, unknown>): string {
  const canonical = canonicalizeEvent(event);
  const digest = require('crypto')
    .createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');
  return `sha256:${digest}`;
}

export async function signEvent(
  event: Record<string, unknown>,
  privateKey: Uint8Array,
  instanceId: string
): Promise<Record<string, unknown>> {
  const canonical = canonicalizeEvent(event);
  const digest = require('crypto').createHash('sha256').update(canonical, 'utf8').digest();
  const signature = await signAsync(new Uint8Array(digest), privateKey);
  return {
    ...event,
    signature: {
      alg: 'ed25519',
      key_id: `${instanceId}:k1`,
      value: Buffer.from(signature).toString('base64'),
    },
  };
}

export async function verifyEventSignature(
  event: Record<string, unknown>,
  publicKey: Uint8Array
): Promise<boolean> {
  const sigBlock = event.signature as
    | { value?: string }
    | undefined;
  if (!sigBlock?.value) {
    return false;
  }
  const canonical = canonicalizeEvent(event);
  const digest = require('crypto').createHash('sha256').update(canonical, 'utf8').digest();
  try {
    const sig = Buffer.from(sigBlock.value, 'base64');
    return await verifyAsync(sig, digest, publicKey);
  } catch {
    return false;
  }
}

export function loadPrivateKey(rawB64: string): Uint8Array {
  return new Uint8Array(Buffer.from(rawB64.trim(), 'base64'));
}
