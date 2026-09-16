import { channelMeta, messagingSavePayload, smsSegments } from './channels.js';

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
assert(payload.sms && payload.viber && payload.viber_routee, 'all channels present');

const broken = {};
for (const ch of [{ id: 'telegram' }]) {
  broken[ch.id] = { ...(form[ch] || {}) };
}
assert(!broken.telegram?.bot_token, 'object-key bug would drop token');

assert(channelMeta('viber_routee').label === 'Viber Routee', 'channel lookup by id');
assert(channelMeta('nope').id === 'email', 'unknown channel falls back');

// --- SMS segments ----------------------------------------------------------

let seg = smsSegments('Hello');
assert(seg.unicode === false && seg.segments === 1 && seg.perSegment === 160, 'latin fits GSM-7');

seg = smsSegments('a'.repeat(160));
assert(seg.segments === 1, '160 GSM-7 characters are one message');
seg = smsSegments('a'.repeat(161));
assert(seg.segments === 2 && seg.perSegment === 153, 'over 160 splits into concatenated parts');

// Greek is the real case here: it is not in the GSM-7 alphabet.
seg = smsSegments('Καλημέρα');
assert(seg.unicode === true && seg.perSegment === 70, 'greek forces UCS-2');
assert(seg.segments === 1, 'short greek message is one segment');
seg = smsSegments('α'.repeat(71));
assert(seg.segments === 2 && seg.perSegment === 67, 'long greek message splits at 67');

seg = smsSegments('€');
assert(seg.unicode === false && seg.units === 2, 'euro sign costs two GSM-7 units');
assert(smsSegments('').segments === 1, 'empty text still reports one segment');

console.log('channels: ok');
