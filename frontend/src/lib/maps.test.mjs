import { mapEmbedUrl, mapUrl } from './maps.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const volos = { name: 'Βόλος', lat: 39.366, lng: 22.946, address_line: 'Αργοναυτών 1', city: 'Βόλος' };

assert(mapUrl(volos, 'google').includes('google.com/maps'), 'google url');
assert(!mapEmbedUrl(volos).includes('google.com'), 'osm embed without key');
assert(mapEmbedUrl(volos, 'google', 'AIzaTest').startsWith('https://www.google.com/maps/embed/v1/place?'), 'google embed with key');
assert(mapEmbedUrl(volos, 'google', 'AIzaTest').includes('key=AIzaTest'), 'embed key param');
assert(mapEmbedUrl({ name: 'Αθήνα', city: 'Αθήνα' }, 'google', 'AIzaTest').includes('q='), 'google embed by address');
assert(mapEmbedUrl({ name: 'Αθήνα' }, 'google', '') === null, 'no embed without coords or key');

console.log('maps: ok');
