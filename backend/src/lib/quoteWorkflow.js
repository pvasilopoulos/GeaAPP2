export const QUOTE_STATUSES = ['draft', 'ready', 'sent', 'accepted', 'rejected', 'expired', 'cancelled'];

export const QUOTE_STATUS_TRANSITIONS = {
  draft: ['ready', 'cancelled'],
  ready: ['draft', 'sent', 'cancelled'],
  sent: ['accepted', 'rejected', 'expired', 'cancelled'],
  accepted: [],
  rejected: [],
  expired: [],
  cancelled: [],
};

export function canTransitionQuoteStatus(from, to) {
  if (!QUOTE_STATUSES.includes(from) || !QUOTE_STATUSES.includes(to)) return false;
  return from === to || QUOTE_STATUS_TRANSITIONS[from].includes(to);
}
