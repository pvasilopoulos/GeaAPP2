import { buildDeliveryPayload, channelCaps, validateMessage } from './messaging.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const html = '<p>Γεια <b>σας</b></p><p><a href="https://gea.gr">Όροι</a></p>';
const image = { url: '/uploads/a.png', name: 'a.png', mime: 'image/png', size: 10 };
const pdf = { url: '/uploads/b.pdf', name: 'b.pdf', mime: 'application/pdf', size: 10 };
const base = { baseUrl: 'https://gea2.softify.gr' };

// --- email: html plus a text alternative, bytes attached -------------------

const mail = buildDeliveryPayload('email', {
  to: 'a@b.gr', subject: 'Θέμα', body: html, bodyFormat: 'html', attachments: [image, pdf],
}, base);
assert(mail.subject === 'Θέμα', 'email keeps the subject');
assert(mail.html.includes('<b>σας</b>'), 'email sends html');
assert(mail.text.includes('Όροι (https://gea.gr)'), 'email carries a text alternative');
assert(mail.attachments.length === 2, 'email takes several attachments');
assert(mail.attachments[0].absoluteUrl === 'https://gea2.softify.gr/uploads/a.png', 'relative upload made absolute');

// --- telegram: inline-only markup, one media ------------------------------

const tg = buildDeliveryPayload('telegram', {
  to: '12345', subject: 'αγνοείται', body: html, bodyFormat: 'html', attachments: [image, pdf],
}, base);
assert(tg.subject === undefined, 'telegram has no subject');
assert(tg.text.includes('<b>σας</b>') && !tg.text.includes('<p>'), 'telegram gets its own html flavour');
assert(tg.attachments.length === 1, 'telegram is capped at one attachment');

// --- text-only channels ---------------------------------------------------

const sms = buildDeliveryPayload('sms', { to: '+3069', body: html, bodyFormat: 'html', attachments: [image] }, base);
assert(!sms.text.includes('<'), 'sms is plain text');
assert(sms.attachments.length === 0, 'sms drops attachments it cannot carry');

const routee = buildDeliveryPayload('viber_routee', {
  to: '6971234567', body: 'Καλημέρα', bodyFormat: 'text',
  attachments: [image], button: { caption: 'Δες', url: 'https://gea.gr' },
}, base);
assert(routee.button.url === 'https://gea.gr', 'routee keeps the button');
assert(routee.attachments[0].absoluteUrl.startsWith('https://'), 'routee media is a public url');

const viber = buildDeliveryPayload('viber', {
  to: '1', body: 'x', bodyFormat: 'text', button: { caption: 'Δες', url: 'https://gea.gr' },
}, base);
assert(viber.button === undefined, 'viber bot does not advertise buttons');

const keepsAbsolute = buildDeliveryPayload('email', {
  to: 'a@b.gr', body: 'x', bodyFormat: 'text',
  attachments: [{ url: 'https://cdn.gr/x.png', mime: 'image/png', name: 'x.png' }],
}, base);
assert(keepsAbsolute.attachments[0].absoluteUrl === 'https://cdn.gr/x.png', 'absolute urls are left alone');

// --- validation -----------------------------------------------------------

assert(validateMessage('sms', { body: '', bodyFormat: 'text' }), 'empty body is rejected');
assert(validateMessage('sms', { body: '<p></p>', bodyFormat: 'html' }), 'markup with no words is rejected');
assert(validateMessage('sms', { body: 'γεια', bodyFormat: 'text' }) === null, 'a short sms passes');
assert(validateMessage('viber_routee', { body: 'α'.repeat(1001), bodyFormat: 'text' }), 'routee length enforced');
assert(validateMessage('sms', { body: 'γεια', attachments: [image] }), 'sms refuses attachments');
assert(validateMessage('telegram', { body: 'γεια', attachments: [image, pdf] }), 'telegram refuses a second file');
assert(validateMessage('viber_routee', { body: 'γεια', attachments: [pdf] }), 'routee refuses a pdf');
assert(validateMessage('email', { body: 'γεια', attachments: [pdf] }) === null, 'email accepts a pdf');

assert(channelCaps('email').subject === true && channelCaps('sms').subject === false, 'caps differ per channel');
assert(channelCaps('unknown').maxLength === channelCaps('sms').maxLength, 'unknown channel falls back to the strictest');

console.log('messagingDelivery: ok');
