import assert from 'node:assert/strict';
import iconv from 'iconv-lite';
import { charsetFromContentType, parseEncodedJson } from './responseEncoding.js';

const payload = { company_name: 'CUPPA SKG Ε Ε', city: 'ΘΕΣΣΑΛΟΝΙΚΗ' };
const encoded = iconv.encode(JSON.stringify(payload), 'windows-1253');
assert.equal(charsetFromContentType('application/json; charset=windows-1253'), 'windows-1253');
assert.deepEqual(parseEncodedJson(encoded, { encoding: 'auto' }).value, payload);
assert.equal(parseEncodedJson(Buffer.from(JSON.stringify(payload)), { encoding: 'utf-8' }).value.city, 'ΘΕΣΣΑΛΟΝΙΚΗ');
console.log('response encoding tests passed');
