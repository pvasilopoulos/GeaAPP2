import assert from 'node:assert/strict';
import { parseFollowUpPayload, followUpStatus } from './followUps.js';

assert.equal(parseFollowUpPayload({ title: ' Call back ', dueAt: '2030-01-02T10:00:00Z' }).title, 'Call back');
assert.equal(parseFollowUpPayload({ title: '', dueAt: '2030-01-02' }).error, 'Απαιτείται τίτλος υπενθύμισης');
assert.equal(parseFollowUpPayload({ title: 'x', dueAt: 'not-a-date' }).error, 'Απαιτείται έγκυρη ημερομηνία');
assert.equal(followUpStatus('2020-01-01T00:00:00Z'), 'overdue');
assert.equal(followUpStatus('2020-01-01T00:00:00Z', 'completed'), 'completed');
console.log('followUps tests passed');
