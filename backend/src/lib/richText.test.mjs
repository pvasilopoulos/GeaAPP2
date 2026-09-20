import {
  htmlToTelegram, htmlToText, renderBody, sanitizeHtml, textToHtml,
} from './richText.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// --- sanitize --------------------------------------------------------------

assert(sanitizeHtml('<p>Γεια <b>σας</b></p>') === '<p>Γεια <b>σας</b></p>', 'keeps the allowed subset');
assert(sanitizeHtml('<script>alert(1)</script>Καλημέρα') === 'Καλημέρα', 'drops scripts with their content');
assert(sanitizeHtml('<b onclick="x()">ok</b>') === '<b>ok</b>', 'strips event handlers');
assert(sanitizeHtml('<span style="color:red">ok</span>') === 'ok', 'unwraps unknown tags but keeps text');
assert(sanitizeHtml('<a href="javascript:alert(1)">κλικ</a>') === '<a>κλικ</a>', 'refuses javascript: links');
assert(sanitizeHtml('<a href="https://a.gr">κλικ</a>') === '<a href="https://a.gr">κλικ</a>', 'keeps https links');
assert(sanitizeHtml('<a href="mailto:a@b.gr">mail</a>').includes('mailto:'), 'keeps mailto links');
// contentEditable emits divs per line; losing them would run the lines together.
assert(sanitizeHtml('<div>Ένα</div><div>Δύο</div>') === '<p>Ένα</p><p>Δύο</p>', 'divs become paragraphs');
assert(sanitizeHtml('<strike>ok</strike>') === '<s>ok</s>', 'legacy tags are normalised');

// --- plain text ------------------------------------------------------------

assert(htmlToText('<p>Ένα</p><p>Δύο</p>') === 'Ένα\nΔύο', 'paragraphs become newlines');
assert(htmlToText('α<br>β') === 'α\nβ', 'br becomes a newline');
assert(htmlToText('<ul><li>Ένα</li><li>Δύο</li></ul>') === '• Ένα\n• Δύο', 'list items get bullets');
assert(htmlToText('<a href="https://a.gr">Όροι</a>') === 'Όροι (https://a.gr)', 'link keeps text and target');
assert(htmlToText('<a href="https://a.gr">https://a.gr</a>') === 'https://a.gr', 'no duplicate when text is the url');
assert(htmlToText('&nbsp;&amp;&lt;b&gt;') === '&<b>', 'entities are decoded');
assert(htmlToText('&#39;α&#x27;') === "'α'", 'numeric entities are decoded');
assert(htmlToText('<b>έντονα</b>') === 'έντονα', 'formatting is dropped, not the words');

// --- telegram --------------------------------------------------------------

const tg = htmlToTelegram('<p>Γεια <b>σας</b></p><ul><li>Ένα</li></ul>');
assert(tg.includes('<b>σας</b>'), 'telegram keeps inline tags');
assert(!tg.includes('<p>') && !tg.includes('<li>'), 'telegram drops block tags it rejects');
assert(tg.includes('• Ένα'), 'telegram list items become bullets');
assert(htmlToTelegram('<b>a') === '<b>a</b>', 'unclosed tags are closed');
assert(htmlToTelegram('5 < 7 & 8') === '5 &lt; 7 &amp; 8', 'bare text is escaped for telegram');
assert(htmlToTelegram('<h1>Τίτλος</h1>') === 'Τίτλος', 'headings flatten to text');

// --- render per target -----------------------------------------------------

assert(textToHtml('α\nβ') === 'α<br>β', 'plain text to html keeps line breaks');
assert(renderBody('<b>γεια</b>', 'html', 'text') === 'γεια', 'html body rendered as text');
assert(renderBody('γεια', 'text', 'html') === 'γεια', 'text body rendered as html');
assert(renderBody('5 < 7', 'text', 'telegram') === '5 &lt; 7', 'text body escaped for telegram');
assert(renderBody('<i>α</i>', 'html', 'telegram') === '<i>α</i>', 'html body kept for telegram');

console.log('richText: ok');
