// Normalizes text for search: lowercases, transliterates Greek → Latin
// (which also strips accents), keeps [a-z0-9], and collapses everything else
// to single spaces. Applied identically to stored `search_norm` and to query
// terms, giving accent/case/script-insensitive substring search with plain
// ASCII LIKE — no DB extensions required.

const MAP = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i',
  κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's',
  ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  ά: 'a', έ: 'e', ή: 'i', ί: 'i', ό: 'o', ύ: 'y', ώ: 'o',
  ϊ: 'i', ϋ: 'y', ΐ: 'i', ΰ: 'y',
};

export function normalize(text) {
  if (text === null || text === undefined) return '';
  const lower = String(text).toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (MAP[ch] !== undefined) out += MAP[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Builds a normalized search string from multiple fields.
export function normalizeFields(...fields) {
  return normalize(fields.filter((v) => v !== null && v !== undefined && v !== '').join(' '));
}
