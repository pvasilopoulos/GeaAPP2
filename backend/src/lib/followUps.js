const STATUSES = new Set(['open', 'completed', 'cancelled']);

export function parseFollowUpPayload(body = {}, { partial = false } = {}) {
  const result = {};
  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim().slice(0, 200);
    if (!title) return { error: 'Απαιτείται τίτλος υπενθύμισης' };
    result.title = title;
  }
  if (!partial || body.dueAt !== undefined || body.due_at !== undefined) {
    const value = body.dueAt ?? body.due_at;
    if (!value || Number.isNaN(new Date(value).getTime())) return { error: 'Απαιτείται έγκυρη ημερομηνία' };
    result.dueAt = value;
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
