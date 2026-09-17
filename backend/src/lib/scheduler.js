import { query } from '../db.js';
import { runSync } from './sync.js';
let timer; const running = new Set();
export function startScheduler() {
  const tick = async () => {
    const { rows } = await query(`SELECT id, tenant_id FROM connectors WHERE enabled = 1 AND schedule_minutes IS NOT NULL AND (last_run_at IS NULL OR last_run_at < DATE_SUB(NOW(), INTERVAL schedule_minutes MINUTE))`);
    for (const c of rows) if (!running.has(c.id)) { running.add(c.id); runSync(c.tenant_id, c.id).catch((e) => console.error('[sync]', e.message)).finally(() => running.delete(c.id)); }
  };
  timer = setInterval(() => tick().catch((e) => console.error('[scheduler]', e.message)), 60000);
  timer.unref?.();
  tick().catch((e) => console.error('[scheduler]', e.message));
  return () => clearInterval(timer);
}
