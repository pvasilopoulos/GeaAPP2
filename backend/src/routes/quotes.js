import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';

export const quotesRouter = Router();
quotesRouter.use(authorize(PERMISSIONS.CUSTOMERS_READ));

function totals(lines = []) {
  return lines.reduce((result, line) => {
    const net = Number(line.quantity || 0) * Number(line.unit_price || 0) * (1 - Number(line.discount_percent || 0) / 100);
    const tax = net * Number(line.tax_percent || 0) / 100;
    line.line_total = Number((net + tax).toFixed(2));
    result.subtotal += net; result.tax_total += tax; result.total += net + tax;
    return result;
  }, { subtotal: 0, tax_total: 0, total: 0 });
}

quotesRouter.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT q.*, c.full_name AS customer_name, c.company, b.name AS branch_name
       FROM quotes q JOIN customers c ON c.id = q.customer_id
       LEFT JOIN branches b ON b.id = q.branch_id
       WHERE q.tenant_id = ? ORDER BY q.quote_date DESC, q.id DESC LIMIT 100`,
      [req.user.tenantId]);
    res.json({ results: rows });
  } catch (err) { next(err); }
});

quotesRouter.get('/:id', async (req, res, next) => {
  try {
    const quote = (await query(
      `SELECT q.*, c.full_name AS customer_name, c.company, b.name AS branch_name
       FROM quotes q JOIN customers c ON c.id = q.customer_id LEFT JOIN branches b ON b.id = q.branch_id
       WHERE q.id = ? AND q.tenant_id = ?`, [Number(req.params.id), req.user.tenantId])).rows[0];
    if (!quote) return res.status(404).json({ error: 'Η προσφορά δεν βρέθηκε' });
    quote.lines = (await query('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY line_order, id', [quote.id])).rows;
    res.json({ quote });
  } catch (err) { next(err); }
});

quotesRouter.post('/resolve-lines', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const { customerId, branchId, referenceStartYear, referenceEndYear, paymentDueDate } = req.body || {};
    if (!customerId) return res.status(400).json({ error: 'Επιλέξτε πελάτη' });
    // Stable contract for the UI until the ERP quote-lines endpoint is configured.
    res.json({ lines: [{ description: `Υπηρεσίες ${referenceStartYear || ''}-${referenceEndYear || ''}`.trim(), quantity: 1, unit_price: 0, discount_percent: 0, tax_percent: 24, branch_id: branchId || null, payment_due_date: paymentDueDate || null }] });
  } catch (err) { next(err); }
});

quotesRouter.post('/', authorize(PERMISSIONS.CUSTOMERS_WRITE), async (req, res, next) => {
  try {
    const b = req.body || {};
    const lines = Array.isArray(b.lines) ? b.lines.map((line, index) => ({ ...line, line_order: index })) : [];
    if (!b.customerId || !b.quoteDate) return res.status(400).json({ error: 'Πελάτης και ημερομηνία είναι υποχρεωτικά' });
    const calculated = totals(lines);
    const number = Number(b.quoteNumber) || Date.now() % 1000000;
    const r = await query(
      `INSERT INTO quotes (tenant_id, series, quote_number, quote_date, customer_id, branch_id, email_template, payment_terms, valid_until, seller_id, reference_start_year, reference_end_year, payment_due_date, send_email, status, subtotal, tax_total, total, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.tenantId, b.series || 'ΠΡΟΣ', number, b.quoteDate, b.customerId, b.branchId || null, b.emailTemplate || null, b.paymentTerms || null, b.validUntil || null, b.sellerId || null, b.referenceStartYear || null, b.referenceEndYear || null, b.paymentDueDate || null, b.sendEmail ? 1 : 0, b.sendEmail ? 'ready' : 'draft', calculated.subtotal, calculated.tax_total, calculated.total, req.user.id]);
    for (const line of lines) await query(
      `INSERT INTO quote_lines (quote_id, line_order, description, quantity, unit_price, discount_percent, tax_percent, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.rows.insertId, line.line_order, line.description || 'Γραμμή', line.quantity || 1, line.unit_price || 0, line.discount_percent || 0, line.tax_percent ?? 24, line.line_total]);
    res.status(201).json({ id: r.rows.insertId, ...calculated });
  } catch (err) { next(err); }
});

