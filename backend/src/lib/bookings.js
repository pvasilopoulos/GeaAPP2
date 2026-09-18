import { query } from '../db.js';

export const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

/**
 * Validates/normalizes a booking create/update payload. Mirrors the shape of
 * parseFollowUpPayload (followUps.js): returns `{ error }` on invalid input,
 * otherwise only the fields present in `body` (or, when partial is false,
 * every required field).
 */
export function parseBookingPayload(body = {}, { partial = false } = {}) {
  const result = {};

  if (!partial || body.branchId !== undefined || body.branch_id !== undefined) {
    const value = body.branchId ?? body.branch_id;
    result.branchId = value === '' || value == null ? null : Number(value);
    if (result.branchId !== null && !Number.isInteger(result.branchId)) return { error: 'Μη έγκυρο υποκατάστημα' };
  }
  if (!partial || body.spaceId !== undefined || body.space_id !== undefined) {
    const value = body.spaceId ?? body.space_id;
    result.spaceId = value === '' || value == null ? null : Number(value);
    if (result.spaceId !== null && !Number.isInteger(result.spaceId)) return { error: 'Μη έγκυρος χώρος' };
  }
  if (body.employeeId !== undefined || body.employee_id !== undefined) {
    const value = body.employeeId ?? body.employee_id;
    result.employeeId = value === '' || value == null ? null : Number(value);
    if (result.employeeId !== null && !Number.isInteger(result.employeeId)) return { error: 'Μη έγκυρος υπάλληλος' };
  }

  const startsProvided = body.startsAt !== undefined || body.starts_at !== undefined;
  const endsProvided = body.endsAt !== undefined || body.ends_at !== undefined;
  if (!partial || startsProvided) {
    const value = body.startsAt ?? body.starts_at;
    const starts = value ? new Date(value) : null;
    if (!starts || Number.isNaN(starts.getTime())) return { error: 'Απαιτείται έγκυρη ώρα έναρξης' };
    result.startsAt = starts;
  }
  if (!partial || endsProvided) {
    const value = body.endsAt ?? body.ends_at;
    const ends = value ? new Date(value) : null;
    if (!ends || Number.isNaN(ends.getTime())) return { error: 'Απαιτείται έγκυρη ώρα λήξης' };
    result.endsAt = ends;
  }
  if (result.startsAt && result.endsAt && result.endsAt <= result.startsAt) {
    return { error: 'Η ώρα λήξης πρέπει να είναι μετά την έναρξη' };
  }

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!BOOKING_STATUSES.includes(status)) return { error: 'Μη έγκυρη κατάσταση κράτησης' };
    result.status = status;
  }
  if (body.amount !== undefined) {
    const amount = body.amount === '' || body.amount == null ? 0 : Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) return { error: 'Μη έγκυρο ποσό' };
    result.amount = amount;
  }
  return result;
}

export async function validateBranch(tenantId, branchId) {
  if (branchId == null) return true;
  const { rows } = await query('SELECT id FROM branches WHERE id = ? AND tenant_id = ?', [branchId, tenantId]);
  return rows.length > 0;
}

export async function validateSpace(tenantId, spaceId, branchId) {
  if (spaceId == null) return true;
  const { rows } = await query(
    'SELECT id, branch_id FROM spaces WHERE id = ? AND tenant_id = ?', [spaceId, tenantId]);
  if (!rows.length) return false;
  if (branchId != null && rows[0].branch_id !== branchId) return false;
  return true;
}

export async function validateEmployee(tenantId, employeeId) {
  if (employeeId == null) return true;
  const { rows } = await query('SELECT id FROM employees WHERE id = ? AND tenant_id = ?', [employeeId, tenantId]);
  return rows.length > 0;
}
