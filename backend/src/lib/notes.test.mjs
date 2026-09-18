import assert from 'node:assert/strict';
import { parseNoteTags, parseNotePayload, noteReminderState } from './notes.js';

assert.deepEqual(parseNoteTags(['VIP', ' vip ', 'Renewal', '']), ['VIP', 'Renewal']);
assert.deepEqual(parseNoteTags('a,b, b ,c'), ['a', 'b', 'c']);
assert.equal(parseNoteTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 8);

assert.equal(parseNotePayload({ body: 'Hello' }).body, 'Hello');
assert.equal(parseNotePayload({ body: '' }).error, 'Η σημείωση δεν μπορεί να είναι κενή');
assert.equal(parseNotePayload({ body: 'x', due_at: 'not-a-date' }).error, 'Μη έγκυρη ημερομηνία υπενθύμισης');
assert.equal(parseNotePayload({ body: 'x', due_at: '2030-01-01T10:00:00Z' }).dueAt.getFullYear(), 2030);
assert.deepEqual(parseNotePayload({ body: 'x', tags: ['a', 'a', 'b'] }).tags, ['a', 'b']);

// Partial mode: only validates/returns fields present in the payload.
const partial = parseNotePayload({ is_archived: 1 }, { partial: true });
assert.equal(partial.isArchived, 1);
assert.equal(partial.body, undefined);
assert.equal(partial.title, undefined);

assert.equal(noteReminderState(null, 0), 'none');
assert.equal(noteReminderState('2020-01-01T00:00:00Z', 0, new Date('2020-06-01')), 'overdue');
assert.equal(noteReminderState('2020-01-01T00:00:00Z', 1, new Date('2019-01-01')), 'none');
assert.equal(noteReminderState('2020-01-01T10:00:00Z', 0, new Date('2020-01-01T00:00:00Z')), 'due_soon');
assert.equal(noteReminderState('2020-02-01T00:00:00Z', 0, new Date('2020-01-01T00:00:00Z')), 'upcoming');

console.log('notes tests passed');
