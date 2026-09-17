import { Router } from 'express';
import { query } from '../db.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { mergeTenantSettings, parseJson } from '../lib/tenantSettings.js';
import { mergeMessaging, deliverMessage } from '../lib/messaging.js';
import { logActivity } from '../lib/activity.js';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUOTE_STATUSES, QUOTE_STATUS_TRANSITIONS } from '../lib/quoteWorkflow.js';
import { mapErpLinesToQuoteLines } from '../lib/quoteLineMapping.js';
import { parseEncodedJson } from '../lib/responseEncoding.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT = path.resolve(__dirname, '../../assets/fonts/DejaVuSans.ttf');
const FONT_BOLD = path.resolve(__dirname, '../../assets/fonts/DejaVuSans-Bold.ttf');

export const quotesRouter = Router();
quotesRouter.use(authorize(PERMISSIONS.QUOTES_VIEW));

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

quotesRouter.post('/resolve-lines', authorize(PERMISSIONS.QUOTES_FETCH_LINES), async (req, res, next) => {
  try {
    const { customerId, branchId, referenceStartYear, referenceEndYear, paymentDueDate } = req.body || {};
    if (!customerId) return res.status(400).json({ error: 'Επιλέξτε πελάτη' });
    const settings = (await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId])).rows[0]?.settings;
    const config = mergeTenantSettings(settings).quote_api;
    if (!config?.url) return res.status(422).json({ error: 'Δεν έχει ρυθμιστεί URL στο Ρυθμίσεις → Προσφορές / ERP API' });
    const values = { customerId, branchId: branchId || null, referenceStartYear: referenceStartYear || null, referenceEndYear: referenceEndYear || null, paymentDueDate: paymentDueDate || null };
    const rendered = String(config.body_template || '{}').replace(/\{\{(\w+)\}\}/g, (_, key) => JSON.stringify(values[key] ?? ''));
    const headers = parseJson(config.headers, {});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(config.url, { method: config.method === 'GET' ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: config.method === 'GET' ? undefined : rendered, signal: controller.signal });
    } finally { clearTimeout(timer); }
    if (!response.ok) return res.status(502).json({ error: `Το ERP API επέστρεψε HTTP ${response.status}` });
    const payload = parseEncodedJson(Buffer.from(await response.arrayBuffer()), {
      encoding: config.response_encoding || 'auto',
      contentType: response.headers.get('content-type'),
    }).value;
    const configuredPath = String(config.response_path || 'data.lines').trim();
    let lines = configuredPath.split('.').filter(Boolean).reduce((value, key) => value?.[key], payload);
    // ERP responses commonly wrap the line array in { data: { lines: [...] } }.
    // Keep the configured path authoritative, but accept this standard envelope
    // when older settings still contain the legacy `lines` path.
    if (!Array.isArray(lines) && configuredPath === 'lines') lines = payload?.data?.lines;
    if (!Array.isArray(lines)) return res.status(502).json({ error: 'Το response του ERP δεν περιέχει array γραμμών στο JSON path που ορίστηκε' });
    res.json({ lines: mapErpLinesToQuoteLines(lines) });
  } catch (err) { next(err); }
});

quotesRouter.post('/', authorize(PERMISSIONS.QUOTES_CREATE), async (req, res, next) => {
  try {
    const b = req.body || {};
    const lines = Array.isArray(b.lines) ? b.lines.map((line, index) => ({ ...line, line_order: index })) : [];
    if (!b.customerId || !b.quoteDate) return res.status(400).json({ error: 'Πελάτης και ημερομηνία είναι υποχρεωτικά' });
    const calculated = totals(lines);
    const number = Number(b.quoteNumber) || Date.now() % 1000000;
    const r = await query(
      `INSERT INTO quotes (tenant_id, series, quote_number, quote_date, customer_id, branch_id, email_template, payment_terms, valid_until, seller_id, reference_start_year, reference_end_year, payment_due_date, send_email, status, status_updated_at, status_updated_by, subtotal, tax_total, total, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)`,
      [req.user.tenantId, b.series || 'ΠΡΟΣ', number, b.quoteDate, b.customerId, b.branchId || null, b.emailTemplate || null, b.paymentTerms || null, b.validUntil || null, b.sellerId || null, b.referenceStartYear || null, b.referenceEndYear || null, b.paymentDueDate || null, b.sendEmail ? 1 : 0, b.sendEmail ? 'ready' : 'draft', req.user.id, calculated.subtotal, calculated.tax_total, calculated.total, req.user.id]);
    for (const line of lines) await query(
      `INSERT INTO quote_lines (quote_id, line_order, description, quantity, unit_price, discount_percent, tax_percent, line_total, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.rows.insertId, line.line_order, line.description || 'Γραμμή', Number(line.quantity) || 1, Number(line.unit_price) || 0, Number(line.discount_percent) || 0, Number(line.tax_percent ?? 24), Number(line.line_total) || 0, line.metadata ? JSON.stringify(line.metadata) : null]);
    res.status(201).json({ id: r.rows.insertId, ...calculated });
  } catch (err) { next(err); }
});

quotesRouter.patch('/:id', authorize(PERMISSIONS.QUOTES_EDIT), async (req, res, next) => {
  try {
    const b = req.body || {};
    const id = Number(req.params.id);
    const lines = Array.isArray(b.lines) ? b.lines.map((line, index) => ({ ...line, line_order: index })) : [];
    if (!b.customerId || !b.quoteDate) return res.status(400).json({ error: 'Πελάτης και ημερομηνία είναι υποχρεωτικά' });
    const existing = (await query('SELECT id, status, quote_number, series FROM quotes WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId])).rows[0];
    if (!existing) return res.status(404).json({ error: 'Η προσφορά δεν βρέθηκε' });
    const calculated = totals(lines);
    await query(
      `UPDATE quotes SET series = ?, quote_number = ?, quote_date = ?, customer_id = ?, branch_id = ?, email_template = ?, payment_terms = ?, valid_until = ?, seller_id = ?, reference_start_year = ?, reference_end_year = ?, payment_due_date = ?, send_email = ?, subtotal = ?, tax_total = ?, total = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
      [b.series || existing.series, Number(b.quoteNumber) || existing.quote_number, b.quoteDate, b.customerId, b.branchId || null, b.emailTemplate || null, b.paymentTerms || null, b.validUntil || null, b.sellerId || null, b.referenceStartYear || null, b.referenceEndYear || null, b.paymentDueDate || null, b.sendEmail ? 1 : 0, calculated.subtotal, calculated.tax_total, calculated.total, id, req.user.tenantId]);
    await query('DELETE FROM quote_lines WHERE quote_id = ?', [id]);
    for (const line of lines) await query(
      `INSERT INTO quote_lines (quote_id, line_order, description, quantity, unit_price, discount_percent, tax_percent, line_total, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, line.line_order, line.description || 'Γραμμή', Number(line.quantity) || 1, Number(line.unit_price) || 0, Number(line.discount_percent) || 0, Number(line.tax_percent ?? 24), Number(line.line_total) || 0, line.metadata ? JSON.stringify(line.metadata) : null]);
    res.json({ id, ...calculated });
  } catch (err) { next(err); }
});

quotesRouter.post('/:id/status', authorize(PERMISSIONS.QUOTES_EDIT), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    if (!QUOTE_STATUSES.includes(nextStatus)) return res.status(400).json({ error: 'Μη έγκυρη κατάσταση προσφοράς' });
    const { rows } = await query('SELECT id, status FROM quotes WHERE id = ? AND tenant_id = ?', [id, req.user.tenantId]);
    const quote = rows[0];
    if (!quote) return res.status(404).json({ error: 'Η προσφορά δεν βρέθηκε' });
    if (quote.status === nextStatus) return res.json({ id, status: nextStatus });
    if (quote.status !== nextStatus && !QUOTE_STATUS_TRANSITIONS[quote.status]?.includes(nextStatus)) {
      return res.status(409).json({ error: `Δεν επιτρέπεται μετάβαση από ${quote.status} σε ${nextStatus}` });
    }
    await query(
      'UPDATE quotes SET status = ?, status_error = NULL, status_updated_at = NOW(), status_updated_by = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
      [nextStatus, req.user.id, id, req.user.tenantId]);
    await logActivity({ tenantId: req.user.tenantId, customerId: (await query('SELECT customer_id FROM quotes WHERE id = ?', [id])).rows[0].customer_id, type: 'quote_status_changed', description: `Προσφορά ${id}: ${quote.status} → ${nextStatus}`, details: { actor: { id: req.user.id } } });
    res.json({ id, status: nextStatus });
  } catch (err) { next(err); }
});

function quoteEmailBody(quote, lines, customBody) {
  if (customBody) return String(customBody);
  const rows = lines.map((line) => `- ${line.description}: ${line.quantity} x ${line.unit_price} = ${line.line_total}`).join('\n');
  return `Προσφορά ${quote.series}-${quote.quote_number}\n\n${rows}\n\nΣύνολο: ${quote.total}\nΙσχύει έως: ${quote.valid_until || '—'}`;
}

async function loadQuote(id, tenantId) {
  const quote = (await query(
    `SELECT q.*, c.full_name AS customer_name, c.company, c.email AS customer_email, b.name AS branch_name
     FROM quotes q JOIN customers c ON c.id = q.customer_id LEFT JOIN branches b ON b.id = q.branch_id
     WHERE q.id = ? AND q.tenant_id = ?`, [id, tenantId])).rows[0];
  if (quote) quote.lines = (await query('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY line_order, id', [id])).rows;
  return quote;
}

quotesRouter.get('/:id/pdf', authorize(PERMISSIONS.QUOTES_VIEW), async (req, res, next) => {
  try {
    const quote = await loadQuote(Number(req.params.id), req.user.tenantId);
    if (!quote) return res.status(404).json({ error: 'Η προσφορά δεν βρέθηκε' });
    const doc = new PDFDocument({ margin: 48 });
    doc.registerFont('R', FONT);
    doc.registerFont('B', FONT_BOLD);
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', async () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="quote-${quote.series}-${quote.quote_number}.pdf"`);
      res.end(pdf);
      await query('UPDATE quotes SET pdf_generated_at = NOW() WHERE id = ? AND tenant_id = ?', [quote.id, req.user.tenantId]).catch((err) => console.error('Quote PDF audit failed:', err));
    });
    doc.font('B').fontSize(20).text(`Προσφορά ${quote.series}-${quote.quote_number}`);
    doc.font('R').moveDown().fontSize(11).text(`Πελάτης: ${quote.company || quote.customer_name}`);
    doc.text(`Ημερομηνία: ${String(quote.quote_date).slice(0, 10)}`);
    if (quote.valid_until) doc.text(`Ισχύει έως: ${String(quote.valid_until).slice(0, 10)}`);
    doc.moveDown().text('Γραμμές');
    quote.lines.forEach((line) => doc.text(`${line.description} | ${line.quantity} x ${line.unit_price} | ${line.line_total}`));
    doc.moveDown().text(`Καθαρή αξία: ${quote.subtotal}`).text(`ΦΠΑ: ${quote.tax_total}`).text(`Σύνολο: ${quote.total}`);
    doc.end();
  } catch (err) { next(err); }
});

quotesRouter.post('/:id/send', authorize(PERMISSIONS.QUOTES_SEND_EMAIL), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const quote = await loadQuote(id, req.user.tenantId);
    if (!quote) return res.status(404).json({ error: 'Η προσφορά δεν βρέθηκε' });
    if (!['draft', 'ready', 'sent'].includes(quote.status)) {
      return res.status(409).json({ error: `Δεν επιτρέπεται αποστολή από την κατάσταση ${quote.status}` });
    }
    const to = String(req.body?.to || quote.customer_email || '').trim();
    if (!to) return res.status(400).json({ error: 'Ο πελάτης δεν έχει email' });
    const settings = (await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId])).rows[0]?.settings;
    const cfg = mergeMessaging(mergeTenantSettings(settings).messaging).email;
    if (!cfg.enabled) return res.status(400).json({ error: 'Το email είναι απενεργοποιημένο στις ρυθμίσεις' });
    const subject = String(req.body?.subject || `Προσφορά ${quote.series}-${quote.quote_number}`).slice(0, 255);
    const body = quoteEmailBody(quote, quote.lines, req.body?.body);
    const delivery = await deliverMessage('email', cfg, { to, subject, body });
    const sent = delivery.status === 'sent';
    await query(
      `UPDATE quotes SET email_sent = ?, email_sent_at = ${sent ? 'NOW()' : 'NULL'}, status = ?, status_error = ?, status_updated_at = NOW(), status_updated_by = ?, updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [sent ? 1 : 0, sent ? 'sent' : quote.status, sent ? null : (delivery.detail || 'Η αποστολή απέτυχε'), req.user.id, id, req.user.tenantId]);
    await query(
      `INSERT INTO communications (customer_id, channel, direction, subject, body, recipient, delivery_status, employee_id)
       VALUES (?, 'email', 'outbound', ?, ?, ?, ?, ?)`,
      [quote.customer_id, subject, body, to, delivery.status, req.user.id]);
    await logActivity({ tenantId: req.user.tenantId, customerId: quote.customer_id, type: 'quote_email_sent', description: `Email προσφοράς προς ${to}`, details: { actor: { id: req.user.id }, quote_id: id, delivery_status: delivery.status, error: delivery.detail || null } });
    if (!sent) return res.status(502).json({ error: delivery.detail || 'Η αποστολή απέτυχε', delivery_status: delivery.status });
    res.json({ id, status: 'sent', delivery_status: delivery.status });
  } catch (err) { next(err); }
});
