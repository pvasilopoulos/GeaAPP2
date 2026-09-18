import { query } from '../db.js';

const STATUSES = new Set(['open', 'completed', 'cancelled']);
// Reminders in the future should not silently disappear once the browser
// closes: cap how far back a "snooze" or manual due date can be nudged.
const MAX_SNOOZE_MINUTES = 10080 * 4; // 4 weeks

export function parseFollowUpPayload(body = {}, { partial = false } = {}) {
  const result = {};
  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim().slice(0, 200);
    if (!title) return { error: 'Απαιτείται τίτλος υπενθύμισης' };
    result.title = title;
  }
  if (!partial || body.dueAt !== undefined || body.due_at !== undefined) {
    const value = body.dueAt ?? body.due_at;
    const due = value ? new Date(value) : null;
    if (!due || Number.isNaN(due.getTime())) return { error: 'Απαιτείται έγκυρη ημερομηνία' };
    // Store as a real Date so the MySQL driver formats a proper DATETIME
    // literal instead of the raw ISO string (which MySQL rejects/mangles
    // because of the "T"/"Z" separators — this used to silently corrupt
    // due dates on some drivers/sql_modes).
    result.dueAt = due;
  }
  if (body.description !== undefined || body.notes !== undefined) {
    result.description = String(body.description ?? body.notes ?? '').trim().slice(0, 1000) || null;
  }
  if (body.assignedEmployeeId !== undefined || body.assigned_employee_id !== undefined) {
    const value = body.assignedEmployeeId ?? body.assigned_employee_id;
    result.assignedEmployeeId = value === '' || value == null ? null : Number(value);
    if (result.assignedEmployeeId !== null && !Number.isInteger(result.assignedEmployeeId)) {
      return { error: 'Μη έγκυρος υπεύθυνος' };
    }
  }
  if (body.branchId !== undefined || body.branch_id !== undefined) {
    const value = body.branchId ?? body.branch_id;
    result.branchId = value === '' || value == null ? null : Number(value);
    if (result.branchId !== null && !Number.isInteger(result.branchId)) {
      return { error: 'Μη έγκυρο υποκατάστημα' };
    }
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!STATUSES.has(status)) return { error: 'Μη έγκυρη κατάσταση υπενθύμισης' };
    result.status = status;
  }
  return result;
}

export function followUpStatus(dueAt, status = 'open', now = new Date()) {
  if (status !== 'open') return status;
  return new Date(dueAt) < now ? 'overdue' : 'open';
}

/** Validates a snooze duration (minutes), used by the snooze endpoint/UI. */
export function parseSnoozeMinutes(input) {
  const minutes = Math.round(Number(input));
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_SNOOZE_MINUTES) {
    return { error: 'Μη έγκυρη διάρκεια αναβολής' };
  }
  return { minutes };
}

/**
 * Recomputes a customer's `next_action_*` fields from the single source of
 * truth (their earliest open follow-up), instead of patching them ad-hoc by
 * matching on title text. Fixes stale/incorrect next-action values left
 * behind when a follow-up's title changed or several follow-ups shared a
 * title. Call after any create/update/delete affecting a customer's
 * follow-ups.
 */
export async function syncCustomerNextAction(tenantId, customerId) {
  const { rows } = await query(
    `SELECT id, title, due_at FROM follow_ups
     WHERE tenant_id = ? AND customer_id = ? AND status = 'open'
     ORDER BY due_at ASC LIMIT 1`,
    [tenantId, customerId]);
  const next = rows[0];
  await query(
    `UPDATE customers SET next_action_at = ?, next_action_note = ?, next_action_followup_id = ?, updated_at = NOW()
     WHERE id = ? AND tenant_id = ?`,
    [next?.due_at ?? null, next?.title ?? null, next?.id ?? null, customerId, tenantId]);
}
