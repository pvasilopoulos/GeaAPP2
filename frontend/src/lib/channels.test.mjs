import { messagingSavePayload } from './channels.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const form = {
  email: { enabled: true, from_email: 'a@b.gr', smtp_host: 'smtp.example.com', configured: true, has_smtp_pass: true },
  telegram: { enabled: true, bot_username: '@spacehub_bot', bot_token: '123:ABC', has_bot_token: true, configured: false },
};

const payload = messagingSavePayload(form);
assert(payload.telegram.bot_token === '123:ABC', 'telegram token kept');
assert(payload.telegram.bot_username === '@spacehub_bot', 'telegram username kept');
assert(payload.telegram.has_bot_token === undefined, 'meta stripped');
assert(payload.telegram.configured === undefined, 'configured stripped');
assert(payload.email.from_email === 'a@b.gr', 'email kept');
assert(payload.email.has_smtp_pass === undefined, 'smtp meta stripped');
assert(payload.sms && payload.viber, 'all channels present');

const broken = {};
for (const ch of [{ id: 'telegram' }]) {
  broken[ch.id] = { ...(form[ch] || {}) };
}
assert(!broken.telegram?.bot_token, 'object-key bug would drop token');

console.log('messagingSavePayload: ok');
