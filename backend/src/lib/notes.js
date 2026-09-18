const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 30;

// Normalizes a tags payload (array or comma separated string) into a
// deduplicated, length-capped array of trimmed strings.
export function parseNoteTags(input) {
  if (input == null) return [];
  const arr = Array.isArray(input) ? input : String(input).split(',');
  const seen = new Set();
  const tags = [];
  for (const raw of arr) {
    const tag = String(raw || '').trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

// Parses/validates a note create/update payload. In partial mode, only
// fields present in `body` are validated and returned (used by PATCH so
// archiving/tagging/etc. can happen without resending the whole note).
export function parseNotePayload(body = {}, { partial = false } = {}) {
  const result = {};
  const touchesBody = body.body !== undefined || body.body_html !== undefined;
  if (!partial || touchesBody) {
    const bodyHtml = String(body.body_html || '').replace(/<script[\s\S]*?<\/script>/gi, '').trim();
    const plain = String(body.body || bodyHtml.replace(/<[^>]+>/g, ' ')).trim();
    if (!plain) return { error: 'Η σημείωση δεν μπορεί να είναι κενή' };
    result.body = plain;
    result.bodyHtml = bodyHtml || null;
  }
  if (!partial || body.title !== undefined) result.title = String(body.title || '').trim().slice(0, 200) || null;
  if (!partial || body.category !== undefined) result.category = String(body.category || 'general').trim().slice(0, 60) || 'general';
  if (!partial || body.is_pinned !== undefined) result.isPinned = body.is_pinned ? 1 : 0;
  if (!partial || body.is_archived !== undefined) result.isArchived = body.is_archived ? 1 : 0;
  if (!partial || body.due_at !== undefined) {
    const value = body.due_at;
    if (value === null || value === '' || value === undefined) {
      result.dueAt = null;
    } else {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return { error: 'Μη έγκυρη ημερομηνία υπενθύμισης' };
      result.dueAt = d;
    }
  }
  if (!partial || body.tags !== undefined) result.tags = parseNoteTags(body.tags);
  return result;
}

// Reminder badge state for a note, used both for API responses and to power
// UI filtering (overdue/due-soon/upcoming). Archived notes never remind.
export function noteReminderState(dueAt, isArchived, now = new Date()) {
  if (!dueAt || isArchived) return 'none';
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return 'none';
  const diffMs = due.getTime() - now.getTime();
  if (diffMs < 0) return 'overdue';
  if (diffMs <= 1000 * 60 * 60 * 24) return 'due_soon';
  return 'upcoming';
}
