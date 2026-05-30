import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  canonicalizeEvent,
  eventContentHash,
  loadPrivateKey,
  signEvent,
  verifyEventSignature,
} from '../src/signing';
import { getPublicKeyAsync } from '@noble/ed25519';

const fixtureDir = (() => {
  const specDir = process.env.INTENTPROOF_SPEC_DIR?.trim();
  if (specDir) {
    return path.join(specDir, 'golden', 'sdk-signing');
  }
  return path.join(__dirname, 'fixtures');
})();

describe('shared signing golden fixtures', () => {
  it('matches Python cross-SDK canonical bytes, hash, and signature', async () => {
    const unsigned = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'signing_unsigned_event.json'), 'utf-8')
    ) as Record<string, unknown>;
    const expectedCanonical = fs.readFileSync(
      path.join(fixtureDir, 'signing_canonical_utf8.txt'),
      'utf-8'
    );
    const expectedHash = fs
      .readFileSync(path.join(fixtureDir, 'signing_event_hash.txt'), 'utf-8')
      .trim();
    const expectedSig = fs
      .readFileSync(path.join(fixtureDir, 'signing_signature_b64.txt'), 'utf-8')
      .trim();
    const privateKeyB64 = fs
      .readFileSync(path.join(fixtureDir, 'signing_private_key_b64.txt'), 'utf-8')
      .trim();

    assert.strictEqual(canonicalizeEvent(unsigned), expectedCanonical);
    const privateKey = loadPrivateKey(privateKeyB64);
    const signed = await signEvent(unsigned, privateKey, 'inst_golden_test');
    assert.strictEqual(eventContentHash(signed), expectedHash);
    assert.strictEqual((signed.signature as { value: string }).value, expectedSig);

    const publicKey = await getPublicKeyAsync(privateKey);
    assert.strictEqual(await verifyEventSignature(signed, publicKey), true);
  });
});
