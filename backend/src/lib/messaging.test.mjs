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

// Viber Routee: a non-image attachment is delivered as a "Text + Button"
// message whose button links to the file's own URL, not via the unreliable
// viberFile message type.
const fileMsgs = buildViberRouteeMessages({
  text: 'Hello',
  attachment: { name: 'doc.pdf', mime: 'application/pdf', url: 'https://x/doc.pdf', size: 1024 },
  action: { caption: 'Open', targetUrl: 'https://x' },
});
assert(fileMsgs.length === 1, 'file attachment stays a single text+button message');
assert(fileMsgs[0].text === 'Hello', 'message keeps the body text');
assert(fileMsgs[0].action?.caption === 'Open', 'existing button caption is kept');
assert(fileMsgs[0].action?.targetUrl === 'https://x/doc.pdf', 'button targets the file URL, not the original button URL');
assert(!fileMsgs[0].viberFile, 'no viberFile message is built');

const fileNoActionMsgs = buildViberRouteeMessages({
  text: '',
  attachment: { name: 'doc.pdf', mime: 'application/pdf', url: 'https://x/doc.pdf', size: 1024 },
});
assert(fileNoActionMsgs.length === 1, 'file attachment with no text/button still stays a single message');
assert(fileNoActionMsgs[0].action?.caption === 'doc.pdf', 'caption falls back to the file name');
assert(fileNoActionMsgs[0].text === 'doc.pdf', 'text falls back to the button caption when there is none');
assert(fileNoActionMsgs[0].action?.targetUrl === 'https://x/doc.pdf', 'button targets the file URL');

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

// A non-image attachment of any size/type/name is now just a URL in a
// button, so none of Routee's viberFile-specific limits (600KB, 25-char
// name, extension whitelist) apply anymore — verify a large, long-named,
// otherwise-unsupported-as-a-file attachment still builds a plain message.
const bigZipMsgs = buildViberRouteeMessages({
  text: '',
  attachment: { name: 'a-very-long-file-name-indeed.zip', mime: 'application/zip', url: 'https://x/archive.zip', size: 5 * 1024 * 1024 },
});
assert(bigZipMsgs.length === 1 && bigZipMsgs[0].action?.targetUrl === 'https://x/archive.zip', 'large/long-named/any-type attachment is unaffected by former viberFile limits');

console.log('messaging: ok');
