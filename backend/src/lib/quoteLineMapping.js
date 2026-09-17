// Dynamic ERP -> quote line mapping (spec: /quotes/resolve-lines).
// Every object returned by the configured ERP array becomes one quote line.
// Every field of the original object is preserved as line metadata (no fixed schema),
// while well-known aliases are used to populate the standard, calculable quote fields.

export const QUOTE_LINE_ALIASES = {
  description: ['description', 'name', 'title', 'item_name'],
  quantity: ['quantity', 'qty'],
  unit_price: ['unit_price', 'price', 'unitPrice', 'amount', 'value'],
  discount_percent: ['discount_percent', 'discount'],
  tax_percent: ['tax_percent', 'tax', 'vat'],
};

const DEFAULTS = { quantity: 1, unit_price: 0, discount_percent: 0, tax_percent: 24 };

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Returns the first alias key present with a non-empty value, regardless of type.
function firstTextAlias(source, keys) {
  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

// Returns the first alias key whose value converts to a finite number ("where numeric").
// A non-numeric value under an earlier alias is skipped in favour of a later, numeric one.
function firstNumericAlias(source, keys) {
  for (const key of keys) {
    if (!(key in source)) continue;
    const numeric = toFiniteNumber(source[key]);
    if (numeric !== null) return numeric;
  }
  return null;
}

/**
 * Normalizes a single raw ERP line object into a quote line: known aliases populate the
 * standard calculable fields, the full original object is kept verbatim under `metadata`.
 */
export function normalizeQuoteLine(raw, index = 0) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const description = firstTextAlias(source, QUOTE_LINE_ALIASES.description);
  const quantity = firstNumericAlias(source, QUOTE_LINE_ALIASES.quantity);
  const unitPrice = firstNumericAlias(source, QUOTE_LINE_ALIASES.unit_price);
  const discountPercent = firstNumericAlias(source, QUOTE_LINE_ALIASES.discount_percent);
  const taxPercent = firstNumericAlias(source, QUOTE_LINE_ALIASES.tax_percent);
  return {
    description: description ?? `Γραμμή ${index + 1}`,
    quantity: quantity ?? DEFAULTS.quantity,
    unit_price: unitPrice ?? DEFAULTS.unit_price,
    discount_percent: discountPercent ?? DEFAULTS.discount_percent,
    tax_percent: taxPercent ?? DEFAULTS.tax_percent,
    metadata: source,
  };
}

/** Maps an array of raw ERP objects (the configured `response_path` array) to quote lines. */
export function mapErpLinesToQuoteLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line, index) => normalizeQuoteLine(line, index));
}
