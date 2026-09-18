export const MAP_PROVIDERS = [
  { id: 'google', label: 'Google Maps' },
  { id: 'osm', label: 'OpenStreetMap' },
  { id: 'apple', label: 'Apple Maps' },
  { id: 'bing', label: 'Bing Maps' },
];

const ALLOWED = new Set(MAP_PROVIDERS.map((p) => p.id));

export function normalizeMapProvider(id) {
  return ALLOWED.has(id) ? id : 'google';
}

export function mapProviderLabel(id) {
  return MAP_PROVIDERS.find((p) => p.id === id)?.label || 'Google Maps';
}

function hasCoords(branch) {
  const lat = Number(branch?.lat);
  const lng = Number(branch?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function addressQuery(branch) {
  return [branch?.address_line, branch?.city, branch?.postal_code, branch?.name].filter(Boolean).join(', ');
}

export function mapUrl(branch, provider = 'google') {
  const p = normalizeMapProvider(provider);
  const name = encodeURIComponent(branch?.name || 'Τοποθεσία');
  if (hasCoords(branch)) {
    const lat = Number(branch.lat);
    const lng = Number(branch.lng);
    if (p === 'osm') return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
    if (p === 'apple') return `https://maps.apple.com/?ll=${lat},${lng}&q=${name}`;
    if (p === 'bing') return `https://www.bing.com/maps?cp=${lat}~${lng}&lvl=16&sp=point.${lat}_${lng}_${name}`;
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  const q = encodeURIComponent(addressQuery(branch));
  if (!q) return null;
  if (p === 'osm') return `https://www.openstreetmap.org/search?query=${q}`;
  if (p === 'apple') return `https://maps.apple.com/?q=${q}`;
  if (p === 'bing') return `https://www.bing.com/maps?where1=${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function mapEmbedUrl(branch, provider = 'google', apiKey = '') {
  const key = String(apiKey || '').trim();
  if (normalizeMapProvider(provider) === 'google' && key) {
    const params = new URLSearchParams({ key });
    if (hasCoords(branch)) params.set('q', `${Number(branch.lat)},${Number(branch.lng)}`);
    else {
      const q = addressQuery(branch);
      if (!q) return null;
      params.set('q', q);
    }
    return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
  }
  if (!hasCoords(branch)) return null;
  const lat = Number(branch.lat);
  const lng = Number(branch.lng);
  const d = 0.012;
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
}
