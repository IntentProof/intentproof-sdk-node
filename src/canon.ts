import { canonicalize } from 'json-canonicalize';

/**
 * Canonicalize returns the RFC 8785 (JCS) canonical JSON string for the
 * given value. This is the canonical form used by all IntentProof signing
 * and verifying paths so that bytes hashed or signed are deterministic
 * across language implementations (Node, Go, Python).
 *
 * The output is stable for objects, arrays, strings, numbers, booleans,
 * and null, with object keys sorted by UTF-16 code unit order and numbers
 * formatted per ES6 Number.prototype.toString.
 */
export function canonicalizeIntentProof(value: unknown): string {
  return canonicalize(value);
}
