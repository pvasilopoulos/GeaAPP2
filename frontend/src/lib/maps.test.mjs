import { addressQuery, mapEmbedUrl, mapUrl } from './maps.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const volos = { name: 'Βόλος', lat: 39.366, lng: 22.946, address_line: 'Αργοναυτών 1', city: 'Βόλος' };

assert(mapUrl(volos, 'google').includes('google.com/maps'), 'google url');
assert(mapUrl(volos, 'google').includes('query='), 'google prefers address search');
assert(!mapUrl(volos, 'google').includes('39.366'), 'coords unused when address exists');
assert(addressQuery({ address_line: 'Οδός 1', postal_code: '19007', area: 'Λαγονήσι', city: 'Σαρωνικός' }) === 'Οδός 1, 19007, Σαρωνικός', 'TK over area');
assert(addressQuery({ address_line: 'Οδός 1', area: 'Λαγονήσι', city: 'Σαρωνικός' }) === 'Οδός 1, Λαγονήσι, Σαρωνικός', 'area when no TK');
assert(decodeURIComponent(mapUrl({ address_line: 'Οδός 1', postal_code: '19007', city: 'Σαρωνικός' })).includes('19007'), 'maps query includes TK');
assert(mapUrl({ lat: 37.6, lng: 24.07 }, 'google').includes('37.6,24.07'), 'coords fallback without address');
assert(!mapEmbedUrl(volos).includes('google.com'), 'osm embed without key');
assert(mapEmbedUrl(volos, 'google', 'AIzaTest').startsWith('https://www.google.com/maps/embed/v1/place?'), 'google embed with key');
assert(mapEmbedUrl(volos, 'google', 'AIzaTest').includes('key=AIzaTest'), 'embed key param');
assert(decodeURIComponent(mapEmbedUrl(volos, 'google', 'AIzaTest').replace(/\+/g, ' ')).includes('Αργοναυτών 1'), 'embed uses address');
assert(mapEmbedUrl({ name: 'Αθήνα', city: 'Αθήνα' }, 'google', 'AIzaTest').includes('q='), 'google embed by address');
assert(mapEmbedUrl({ name: 'Αθήνα' }, 'google', '') === null, 'no embed without coords or key');

console.log('maps: ok');
