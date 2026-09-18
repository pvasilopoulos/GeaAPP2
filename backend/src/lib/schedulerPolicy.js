export function isDue(lastRunAt, intervalMinutes, now = Date.now()) {
  if (!intervalMinutes || intervalMinutes < 1) return false;
  return !lastRunAt || now - new Date(lastRunAt).getTime() >= intervalMinutes * 60000;
}
export function retryDelay(attempt, baseMs = 250, maxMs = 30000) {
  return Math.min(maxMs, baseMs * (2 ** Math.max(0, attempt)));
}
