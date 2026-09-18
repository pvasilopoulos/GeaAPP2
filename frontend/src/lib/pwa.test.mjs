import assert from 'node:assert/strict';
import { isChromium, isIosDevice, isIosSafari, resolveInstallMode } from './pwa.js';

assert.equal(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), true);
assert.equal(isIosSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'), true);
assert.equal(isIosSafari('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'), false);
assert.equal(isIosDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'), false);
assert.equal(isChromium('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'), true);
assert.equal(isChromium('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'), false);

assert.equal(resolveInstallMode({ standalone: true, hasPrompt: true }), 'installed');
assert.equal(resolveInstallMode({ hasPrompt: true, dismissed: true }), 'dismissed');
assert.equal(resolveInstallMode({ secure: false, ua: 'Chrome/120' }), 'insecure');
assert.equal(resolveInstallMode({
  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
}), 'ios-safari');
assert.equal(resolveInstallMode({
  ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
}), 'ios-other');
assert.equal(resolveInstallMode({
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}), 'chromium-menu');
assert.equal(resolveInstallMode({ ua: 'Mozilla/5.0 Firefox/121.0' }), 'manual');
assert.equal(resolveInstallMode({ dismissed: true, ua: 'Chrome/120' }), 'dismissed');

console.log('pwa tests passed');
