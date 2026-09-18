import assert from 'node:assert/strict';
import { canTransitionQuoteStatus } from './quoteWorkflow.js';

assert.equal(canTransitionQuoteStatus('draft', 'ready'), true);
assert.equal(canTransitionQuoteStatus('ready', 'sent'), true);
assert.equal(canTransitionQuoteStatus('sent', 'accepted'), true);
assert.equal(canTransitionQuoteStatus('draft', 'accepted'), false);
assert.equal(canTransitionQuoteStatus('accepted', 'draft'), false);
assert.equal(canTransitionQuoteStatus('draft', 'draft'), true);
assert.equal(canTransitionQuoteStatus('unknown', 'ready'), false);
console.log('quote workflow tests passed');
