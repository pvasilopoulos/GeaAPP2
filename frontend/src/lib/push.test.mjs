import assert from 'node:assert/strict';
import { urlBase64ToUint8Array, pushSupported, pushPermission } from './push.js';

// Node has no `window`/`Notification` — these must degrade gracefully rather than throw.
assert.equal(pushSupported(), false);
assert.equal(pushPermission(), 'unsupported');

// A known VAPID-style base64url public key decodes to a 65-byte uncompressed EC point.
const key = 'BEl62iUYgUivxIkv69yViEuiBIa40HI0DLLuxazjs9Kh4-jyMbCw5j9nRB6DaZ4jXTUZKKxi6y9wR2eS3sxNXWA';
const bytes = urlBase64ToUint8Array(key);
assert.ok(bytes instanceof Uint8Array);
assert.equal(bytes.length, 65);
assert.equal(bytes[0], 4); // uncompressed EC point marker

console.log('frontend push tests passed');
