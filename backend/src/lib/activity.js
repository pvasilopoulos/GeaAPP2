import { query } from '../db.js';

export async function logActivity({ tenantId, customerId, type, description, branchId = null, spaceId = null }) {
  if (!tenantId || !customerId || !type) return;
  await query(
    `INSERT INTO activities (tenant_id, customer_id, type, description, branch_id, space_id)
     VALUES (?,?,?,?,?,?)`,
    [tenantId, customerId, type, description || null, branchId, spaceId]);
}
