import {
  applyMessagingPatch, channelStatuses, isConfigured, mergeMessaging, publicMessaging,
} from './messaging.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const merged = mergeMessaging(undefined);
assert(merged.email.enabled === true, 'email enabled by default');
assert(merged.telegram.bot_token === '', 'empty telegram token');
assert(isConfigured('email', merged.email) === false, 'email not configured by default');

const patched = applyMessagingPatch(merged, {
  email: { enabled: false, from_email: 'hello@demo.gr', smtp_host: 'smtp.demo.gr', smtp_pass: 'secret' },
  telegram: { bot_token: '123:abc' },
  viber_routee: {
    application_id: 'app-id',
    application_secret: 'app-secret',
    sender_info_tracking_id: 'sender-1',
  },
});
assert(patched.email.enabled === false, 'email can be disabled');
assert(patched.email.smtp_pass === 'secret', 'smtp pass stored');
assert(isConfigured('email', patched.email) === true, 'email configured after host+from');
assert(isConfigured('telegram', patched.telegram) === true, 'telegram configured');
assert(isConfigured('viber_routee', patched.viber_routee) === true, 'viber routee configured');

const kept = applyMessagingPatch(patched, {
  email: { smtp_pass: '••••••••', from_name: 'Demo' },
  viber_routee: { application_secret: '••••••••', sender_info_tracking_id: 'sender-2' },
});
assert(kept.email.smtp_pass === 'secret', 'masked secret is not overwritten');
assert(kept.email.from_name === 'Demo', 'non-secret fields update');
assert(kept.viber_routee.application_secret === 'app-secret', 'masked routee secret kept');
assert(kept.viber_routee.sender_info_tracking_id === 'sender-2', 'routee sender id updates');

const pub = publicMessaging(kept);
assert(pub.email.smtp_pass === undefined, 'secret stripped from public payload');
assert(pub.email.has_smtp_pass === true, 'has_smtp_pass flag');
assert(pub.viber_routee.application_secret === undefined, 'routee secret stripped');
assert(pub.viber_routee.has_application_secret === true, 'has_application_secret flag');
assert(pub.email.configured === true, 'configured flag on public payload');

const statuses = channelStatuses(kept);
assert(statuses.find((c) => c.id === 'email').enabled === false, 'status enabled');
assert(statuses.find((c) => c.id === 'telegram').configured === true, 'status configured');
assert(statuses[0].id === 'email' && statuses[1].id === 'viber' && statuses[2].id === 'viber_routee', 'channel order');

console.log('messaging: ok');
