import assert from 'node:assert/strict';
import { applyAuth, maskHeaders, toQueryString, clampTimeout } from './erpClient.js';

// applyAuth: bearer
{
  const { headers } = applyAuth({ type: 'bearer', token: 'abc123' }, { url: 'https://x/y', headers: {} });
  assert.equal(headers.Authorization, 'Bearer abc123');
}

// applyAuth: basic
{
  const { headers } = applyAuth({ type: 'basic', username: 'u', password: 'p' }, { url: 'https://x/y', headers: {} });
  assert.equal(headers.Authorization, `Basic ${Buffer.from('u:p').toString('base64')}`);
}

// applyAuth: apikey header
{
  const { headers, url } = applyAuth({ type: 'apikey', api_key_name: 'X-Api-Key', api_key_value: 'secret', api_key_in: 'header' }, { url: 'https://x/y', headers: {} });
  assert.equal(headers['X-Api-Key'], 'secret');
  assert.equal(url, 'https://x/y');
}

// applyAuth: apikey query
{
  const { url } = applyAuth({ type: 'apikey', api_key_name: 'key', api_key_value: 'secret', api_key_in: 'query' }, { url: 'https://x/y', headers: {} });
  assert.ok(url.includes('key=secret'));
}

// applyAuth: none leaves headers untouched
{
  const { headers, url } = applyAuth({ type: 'none' }, { url: 'https://x/y', headers: { Foo: 'bar' } });
  assert.deepEqual(headers, { Foo: 'bar' });
  assert.equal(url, 'https://x/y');
}

// maskHeaders masks credential-looking keys, leaves others untouched
{
  const masked = maskHeaders({ Authorization: 'Bearer abcdefgh12345', 'X-Api-Key': 'shortkey', 'Content-Type': 'application/json' });
  assert.equal(masked['Content-Type'], 'application/json');
  assert.ok(masked.Authorization.includes('••••'));
  assert.notEqual(masked.Authorization, 'Bearer abcdefgh12345');
}

// toQueryString skips nullish values, JSON-stringifies objects
{
  const qs = toQueryString({ a: 1, b: null, c: undefined, d: { x: 1 } });
  const params = new URLSearchParams(qs);
  assert.equal(params.get('a'), '1');
  assert.equal(params.has('b'), false);
  assert.equal(params.has('c'), false);
  assert.equal(params.get('d'), '{"x":1}');
}

// clampTimeout defaults and clamps
{
  assert.equal(clampTimeout(undefined), 30000);
  assert.equal(clampTimeout(0), 30000);
  assert.equal(clampTimeout(500), 2000);
  assert.equal(clampTimeout(999999), 120000);
  assert.equal(clampTimeout(5000), 5000);
}

console.log('erpClient tests passed');
