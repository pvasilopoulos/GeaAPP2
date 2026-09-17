import assert from 'node:assert/strict';
import { parseFollowUpPayload, followUpStatus, parseSnoozeMinutes } from './followUps.js';

assert.equal(parseFollowUpPayload({ title: ' Call back ', dueAt: '2030-01-02T10:00:00Z' }).title, 'Call back');
assert.equal(parseFollowUpPayload({ title: '', dueAt: '2030-01-02' }).error, 'Απαιτείται τίτλος υπενθύμισης');
assert.equal(parseFollowUpPayload({ title: 'x', dueAt: 'not-a-date' }).error, 'Απαιτείται έγκυρη ημερομηνία');
assert.equal(followUpStatus('2020-01-01T00:00:00Z'), 'overdue');
assert.equal(followUpStatus('2020-01-01T00:00:00Z', 'completed'), 'completed');

// dueAt must be a real Date (not a raw ISO string) so mysql2 emits a valid
// DATETIME literal instead of a "T"/"Z" string MySQL rejects.
const parsedDue = parseFollowUpPayload({ title: 'Call', dueAt: '2030-06-15T12:30:00.000Z' });
assert.ok(parsedDue.dueAt instanceof Date, 'dueAt should be normalized to a Date instance');
assert.equal(parsedDue.dueAt.toISOString(), '2030-06-15T12:30:00.000Z');

// snooze validation
assert.deepEqual(parseSnoozeMinutes(60), { minutes: 60 });
assert.deepEqual(parseSnoozeMinutes('120'), { minutes: 120 });
assert.equal(parseSnoozeMinutes(0).error, 'Μη έγκυρη διάρκεια αναβολής');
assert.equal(parseSnoozeMinutes(-5).error, 'Μη έγκυρη διάρκεια αναβολής');
assert.equal(parseSnoozeMinutes('not-a-number').error, 'Μη έγκυρη διάρκεια αναβολής');
assert.equal(parseSnoozeMinutes(999999).error, 'Μη έγκυρη διάρκεια αναβολής');

console.log('followUps tests passed');
