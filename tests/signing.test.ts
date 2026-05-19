import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  canonicalizeEvent,
  loadPrivateKey,
  signEvent,
  verifyEventSignature,
} from '../src/signing';
import { getPublicKeyAsync } from '@noble/ed25519';

const fixtureDir = path.join(__dirname, 'fixtures');

describe('signing helpers', () => {
  it('returns false when signature block is missing', async () => {
    const unsigned = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'signing_unsigned_event.json'), 'utf-8')
    ) as Record<string, unknown>;
    const privateKey = loadPrivateKey(
      fs.readFileSync(path.join(fixtureDir, 'signing_private_key_b64.txt'), 'utf-8')
    );
    const publicKey = await getPublicKeyAsync(privateKey);
    assert.strictEqual(await verifyEventSignature(unsigned, publicKey), false);
  });

  it('returns false when signature verification fails', async () => {
    const unsigned = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'signing_unsigned_event.json'), 'utf-8')
    ) as Record<string, unknown>;
    const privateKey = loadPrivateKey(
      fs.readFileSync(path.join(fixtureDir, 'signing_private_key_b64.txt'), 'utf-8')
    );
    const signed = await signEvent(unsigned, privateKey, 'inst_golden_test');
    const publicKey = await getPublicKeyAsync(privateKey);
    (signed.signature as { value: string }).value =
      Buffer.alloc(64, 0).toString('base64');
    assert.strictEqual(await verifyEventSignature(signed, publicKey), false);
  });

  it('canonicalizeEvent strips signature before hashing', async () => {
    const unsigned = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'signing_unsigned_event.json'), 'utf-8')
    ) as Record<string, unknown>;
    const privateKey = loadPrivateKey(
      fs.readFileSync(path.join(fixtureDir, 'signing_private_key_b64.txt'), 'utf-8')
    );
    const signed = await signEvent(unsigned, privateKey, 'inst_golden_test');
    assert.strictEqual(
      canonicalizeEvent(signed),
      canonicalizeEvent(unsigned)
    );
  });
});
