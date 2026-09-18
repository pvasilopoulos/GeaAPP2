export function formatRelativeTime(value, now = Date.now()) {
  if (!value) return '';
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '';
  const diff = now - t;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return 'μόλις τώρα';
  const min = Math.round(sec / 60);
  if (min < 60) return min === 1 ? 'πριν 1 λεπτό' : `πριν ${min} λεπτά`;
  const hours = Math.round(min / 60);
  if (hours < 24) return hours === 1 ? 'πριν 1 ώρα' : `πριν ${hours} ώρες`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'χθες';
  if (days < 30) return `πριν ${days} ημέρες`;
  return new Date(value).toLocaleDateString('el-GR');
}

export function notificationIcon(type) {
  switch (type) {
    case 'follow_up_overdue': return 'clock';
    case 'follow_up_due_soon': return 'bell';
    case 'follow_up_assigned': return 'users';
    case 'connector_run_failed': return 'refresh';
    case 'quote_expired': return 'file';
    default: return 'bell';
  }
}

export function notificationTarget(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  switch (row?.source_type) {
    case 'follow_up':
      return {
        kind: 'customer',
        customerId: row.customer_id || payload.customer_id || null,
        customerName: payload.customer_name || null,
      };
    case 'quote':
      return { kind: 'quote', quoteId: row.source_id, customerId: row.customer_id || null };
    case 'sync_run':
      return { kind: 'connector', connectorId: payload.connector_id || null, runId: row.source_id };
    default:
      if (row?.customer_id) return { kind: 'customer', customerId: row.customer_id, customerName: payload.customer_name || null };
      return null;
  }
}
