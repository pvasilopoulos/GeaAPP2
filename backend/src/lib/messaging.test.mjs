import {
  applyMessagingPatch, buildViberRouteeMessages, channelStatuses, CHANNEL_CAPS, isConfigured, mergeMessaging, publicMessaging,
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

for (const id of ['email', 'telegram', 'viber', 'viber_routee']) {
  assert(CHANNEL_CAPS[id].attachments === true, `${id} accepts attachments`);
  assert(CHANNEL_CAPS[id].button === true, `${id} accepts a button`);
  assert(CHANNEL_CAPS[id].attachmentsMax >= 1, `${id} has a positive attachments limit`);
}
assert(CHANNEL_CAPS.sms.attachments === false, 'sms has no attachments');
assert(CHANNEL_CAPS.sms.button === false, 'sms has no button');
assert(CHANNEL_CAPS.email.attachmentsMax > 1, 'email allows several attachments');
assert(CHANNEL_CAPS.viber.attachmentsMax === 1, 'viber allows a single attachment per message');

// Viber Routee: a viberFile message has no caption field, so text + a
// non-image attachment must be split into a text-only message followed by
// the file message (which carries the button, if any).
const fileMsgs = buildViberRouteeMessages({
  text: 'Hello',
  attachment: { name: 'doc.pdf', mime: 'application/pdf', url: 'https://x/doc.pdf', size: 1024 },
  action: { caption: 'Open', targetUrl: 'https://x' },
});
assert(fileMsgs.length === 2, 'file attachment + text splits into two messages');
assert(fileMsgs[0].text === 'Hello' && !fileMsgs[0].viberFile, 'first message is text-only');
assert(fileMsgs[1].viberFile?.fileURL === 'https://x/doc.pdf', 'second message carries the file');
assert(!fileMsgs[1].text, 'file message has no caption/text field');
assert(fileMsgs[1].action?.targetUrl === 'https://x', 'file message carries the button');
assert(fileMsgs[1].viberFile?.fileType === 'pdf', 'fileType is a bare extension, not a MIME string (Viber rejects "application/pdf" as unsupported)');

const imageMsgs = buildViberRouteeMessages({
  text: 'Hello',
  attachment: { name: 'pic.jpg', mime: 'image/jpeg', url: 'https://x/pic.jpg' },
});
// Routee's Viber module rejects a plain "Text + Image" combination with no
// button (errorCode 007, "Invalid viber message type combination") — only
// "Text + Action + Image" is supported alongside image, so caption text
// without a button must be split into its own message.
assert(imageMsgs.length === 2, 'image + text with no button splits into two messages');
assert(imageMsgs[0].text === 'Hello' && !imageMsgs[0].imageURL, 'first message is text-only');
assert(imageMsgs[1].imageURL === 'https://x/pic.jpg' && !imageMsgs[1].text, 'second message is the image alone');

const imageWithButtonMsgs = buildViberRouteeMessages({
  text: 'Hello',
  attachment: { name: 'pic.jpg', mime: 'image/jpeg', url: 'https://x/pic.jpg' },
  action: { caption: 'Open', targetUrl: 'https://x' },
});
assert(imageWithButtonMsgs.length === 1, 'image + text + button stays one message (a supported combination)');
assert(imageWithButtonMsgs[0].text === 'Hello' && imageWithButtonMsgs[0].imageURL === 'https://x/pic.jpg' && imageWithButtonMsgs[0].action?.targetUrl === 'https://x', 'combined message carries text, image and button');

const imageOnlyMsgs = buildViberRouteeMessages({
  text: '',
  attachment: { name: 'pic.jpg', mime: 'image/jpeg', url: 'https://x/pic.jpg' },
});
assert(imageOnlyMsgs.length === 1 && imageOnlyMsgs[0].imageURL === 'https://x/pic.jpg' && !imageOnlyMsgs[0].text, 'image with no caption stays a single message');

const noAttachMsgs = buildViberRouteeMessages({ text: 'Hello' });
assert(noAttachMsgs.length === 1 && noAttachMsgs[0].text === 'Hello' && !noAttachMsgs[0].imageURL && !noAttachMsgs[0].viberFile, 'plain text message unaffected');

// Routee documents (docs.routee.net/docs/other-viber-messaging-concept) a
// hard 600KB size limit and 25-character name limit for viberFile — both
// are silently rejected as the opaque errorCode 019 "not valid" with no
// size/length detail, so these are checked up front with an actionable
// message instead.
function assertThrows(fn, pattern, msg) {
  try {
    fn();
  } catch (err) {
    assert(pattern.test(err.message), `${msg} (unexpected message: ${err.message})`);
    return;
  }
  throw new Error(`${msg} (did not throw)`);
}

assertThrows(() => buildViberRouteeMessages({
  text: '',
  attachment: { name: 'big.pdf', mime: 'application/pdf', url: 'https://x/big.pdf', size: 700 * 1024 },
}), /600KB/, 'oversized viberFile attachment is rejected before calling Routee');

assertThrows(() => buildViberRouteeMessages({
  text: '',
  attachment: { name: 'a-very-long-file-name-indeed.pdf', mime: 'application/pdf', url: 'https://x/a.pdf', size: 1024 },
}), /25 χαρακτ/, 'overly long viberFile file name is rejected before calling Routee');

console.log('messaging: ok');
