export const MESSAGE_CHANNELS = [
  { id: 'email', label: 'Email', icon: 'mail', color: '#2563eb', recipientKind: 'email',
    hint: 'Email μέσω SMTP', placeholder: 'email@domain.gr' },
  { id: 'viber', label: 'Viber', icon: 'viber', color: '#7360f2', recipientKind: 'phone',
    hint: 'Viber Business', placeholder: '30XXXXXXXXXX' },
  { id: 'sms', label: 'SMS', icon: 'sms', color: '#059669', recipientKind: 'phone',
    hint: 'Γραπτό μήνυμα', placeholder: '30XXXXXXXXXX' },
  { id: 'telegram', label: 'Telegram', icon: 'telegram', color: '#229ed9', recipientKind: 'telegram',
    hint: 'Telegram Bot', placeholder: '@username ή chat id' },
];

export function channelMeta(id) {
  return MESSAGE_CHANNELS.find((c) => c.id === id) || MESSAGE_CHANNELS[0];
}

export function recipientSuggestions(channelId, customer = {}, contacts = []) {
  const kind = channelMeta(channelId).recipientKind;
  const items = [];
  const add = (value, label) => {
    const v = String(value || '').trim();
    if (!v || items.some((x) => x.value === v)) return;
    items.push({ value: v, label: label || v });
  };
  const name = customer.full_name || 'Πελάτης';
  if (kind === 'email') {
    add(customer.email, name);
    for (const c of contacts) add(c.email, `${c.first_name} ${c.last_name}`.trim());
  } else {
    add(customer.mobile, name);
    add(customer.phone, name);
    for (const c of contacts) {
      add(c.mobile, `${c.first_name} ${c.last_name}`.trim());
      add(c.phone, `${c.first_name} ${c.last_name}`.trim());
    }
  }
  return items;
}
