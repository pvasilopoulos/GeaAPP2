import assert from 'node:assert/strict';
import { normalizeQuoteLine, mapErpLinesToQuoteLines } from './quoteLineMapping.js';

// -- alias resolution ---------------------------------------------------
assert.equal(normalizeQuoteLine({ description: 'Χώρος Α', quantity: 2, unit_price: 10 }).description, 'Χώρος Α');
assert.equal(normalizeQuoteLine({ name: 'Χώρος Β' }).description, 'Χώρος Β');
assert.equal(normalizeQuoteLine({ title: 'Χώρος Γ' }).description, 'Χώρος Γ');
assert.equal(normalizeQuoteLine({ item_name: 'Χώρος Δ' }).description, 'Χώρος Δ');
assert.equal(normalizeQuoteLine({ qty: 5 }).quantity, 5);
assert.equal(normalizeQuoteLine({ price: 12.5 }).unit_price, 12.5);
assert.equal(normalizeQuoteLine({ unitPrice: 8 }).unit_price, 8);
assert.equal(normalizeQuoteLine({ amount: 3 }).unit_price, 3);
assert.equal(normalizeQuoteLine({ value: 4 }).unit_price, 4);
assert.equal(normalizeQuoteLine({ discount: 15 }).discount_percent, 15);
assert.equal(normalizeQuoteLine({ discount_percent: 20 }).discount_percent, 20);
assert.equal(normalizeQuoteLine({ tax: 24 }).tax_percent, 24);
assert.equal(normalizeQuoteLine({ vat: 13 }).tax_percent, 13);
assert.equal(normalizeQuoteLine({ tax_percent: 6 }).tax_percent, 6);

// alias priority: earlier alias in the list wins when both are present
assert.equal(normalizeQuoteLine({ description: 'Primary', name: 'Secondary' }).description, 'Primary');
assert.equal(normalizeQuoteLine({ unit_price: 100, price: 1 }).unit_price, 100);

// -- defaults for missing/blank fields -----------------------------------
const empty = normalizeQuoteLine({}, 2);
assert.equal(empty.description, 'Γραμμή 3');
assert.equal(empty.quantity, 1);
assert.equal(empty.unit_price, 0);
assert.equal(empty.discount_percent, 0);
assert.equal(empty.tax_percent, 24);

// -- malformed / non-numeric values fall back to next alias or default ---
assert.equal(normalizeQuoteLine({ amount: 'N/A', value: 7 }).unit_price, 7, 'non-numeric amount should be skipped for a later numeric alias');
assert.equal(normalizeQuoteLine({ price: 'call for price' }).unit_price, 0, 'non-numeric-only aliases fall back to default');
assert.equal(normalizeQuoteLine({ qty: 'many' }).quantity, 1);
assert.equal(normalizeQuoteLine({ tax: true }).tax_percent, 24, 'booleans are not treated as numeric');
assert.equal(normalizeQuoteLine({ discount: null }).discount_percent, 0);
assert.equal(normalizeQuoteLine({ unit_price: '19.90' }).unit_price, 19.9, 'numeric strings are coerced');
assert.equal(normalizeQuoteLine(null).description, 'Γραμμή 1');
assert.equal(normalizeQuoteLine('not-an-object').description, 'Γραμμή 1');
assert.equal(normalizeQuoteLine([1, 2, 3]).description, 'Γραμμή 1', 'arrays are not treated as line objects');

// -- metadata preserves the full original object dynamically -------------
const rawLine = { item_name: 'Booth', qty: 3, price: 55, custom_field: 'foo', nested: { a: 1 }, tags: ['x', 'y'] };
const normalized = normalizeQuoteLine(rawLine);
assert.deepEqual(normalized.metadata, rawLine);
assert.equal(normalized.metadata.custom_field, 'foo');
assert.deepEqual(normalized.metadata.nested, { a: 1 });
assert.deepEqual(normalized.metadata.tags, ['x', 'y']);

// -- array mapping --------------------------------------------------------
assert.deepEqual(mapErpLinesToQuoteLines(null), []);
assert.deepEqual(mapErpLinesToQuoteLines('nope'), []);
const mapped = mapErpLinesToQuoteLines([
  { name: 'Α', qty: 1, price: 10 },
  { description: 'Β', quantity: 2, unit_price: 20, extra: true },
]);
assert.equal(mapped.length, 2);
assert.equal(mapped[0].description, 'Α');
assert.equal(mapped[1].metadata.extra, true);

// -- backward compatibility with existing fixed-schema ERP responses -----
const legacy = normalizeQuoteLine({ description: 'Legacy line', quantity: 4, unit_price: 30, discount_percent: 10, tax_percent: 24 });
assert.equal(legacy.description, 'Legacy line');
assert.equal(legacy.quantity, 4);
assert.equal(legacy.unit_price, 30);
assert.equal(legacy.discount_percent, 10);
assert.equal(legacy.tax_percent, 24);

console.log('quote line mapping tests passed');
