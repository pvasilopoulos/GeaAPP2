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
import { logAuditFromReq } from '../lib/audit.js';
import { evaluateNotificationRules } from '../lib/notificationRules.js';
import { renderPushTemplate } from '../lib/pushSync.js';
import { getPath } from '../lib/mapping.js';
import { callConfiguredErp, responseSnapshot } from '../lib/erpClient.js';

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

async function insertQuoteLine(quoteId, line) {
  const values = [quoteId, line.line_order, line.description || 'Γραμμή', Number(line.quantity) || 1, Number(line.unit_price) || 0, Number(line.discount_percent) || 0, Number(line.tax_percent ?? 24), Number(line.line_total) || 0];
  try {
    await query(
      `INSERT INTO quote_lines (quote_id, line_order, description, quantity, unit_price, discount_percent, tax_percent, line_total, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values, line.metadata ? JSON.stringify(line.metadata) : null]);
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR' && error?.errno !== 1054) throw error;
    await query(
      `INSERT INTO quote_lines (quote_id, line_order, description, quantity, unit_price, discount_percent, tax_percent, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      values);
  }
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
    const {
      customerId, branchId, referenceStartYear, referenceEndYear, paymentDueDate,
      series, quoteNumber, quoteDate, validUntil, paymentTerms, sellerId,
    } = req.body || {};
    if (!customerId) return res.status(400).json({ error: 'Επιλέξτε πελάτη' });
    const settings = (await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId])).rows[0]?.settings;
    const config = mergeTenantSettings(settings).quote_api;
    if (!config?.url) return res.status(422).json({ error: 'Δεν έχει ρυθμιστεί URL στο Ρυθμίσεις → Προσφορές / ERP API' });
    if (config.enabled === false) return res.status(422).json({ error: 'Η ενσωμάτωση με το ERP είναι απενεργοποιημένη (δες Ρυθμίσεις → Προσφορές / ERP API).' });
    const customer = (await query(
      'SELECT id, erp_id, code, full_name, company, tax_id, email, phone FROM customers WHERE id = ? AND tenant_id = ?',
      [customerId, req.user.tenantId])).rows[0];
    if (!customer) return res.status(404).json({ error: 'Ο πελάτης δεν βρέθηκε' });
    const branch = branchId
      ? (await query('SELECT id, erp_id, code, name, city, address_line FROM branches WHERE id = ? AND tenant_id = ?', [branchId, req.user.tenantId])).rows[0]
      : null;
    // Full set of variables available to {{placeholders}} in quote_api.body_template.
    const values = {
      customerId, customerErpId: customer.erp_id || null, customerCode: customer.code || null,
      customerName: customer.full_name || null, customerCompany: customer.company || null,
      customerTaxId: customer.tax_id || null, customerEmail: customer.email || null, customerPhone: customer.phone || null,
      branchId: branchId || null, branchErpId: branch?.erp_id || null, branchCode: branch?.code || null,
      branchName: branch?.name || null, branchCity: branch?.city || null, branchAddress: branch?.address_line || null,
      series: series || null, quoteNumber: quoteNumber || null, quoteDate: quoteDate || null, validUntil: validUntil || null,
      paymentTerms: paymentTerms || null, sellerId: sellerId || null,
      referenceStartYear: referenceStartYear || null, referenceEndYear: referenceEndYear || null, paymentDueDate: paymentDueDate || null,
    };
    let rendered;
    try {
      rendered = renderPushTemplate(config.body_template, values);
    } catch (templateError) {
      return res.status(422).json({ error: `Μη έγκυρο body template: ${templateError.message}` });
    }
    const headers = parseJson(config.headers, {});
    let call;
    try {
      call = await callConfiguredErp(config, headers, rendered);
    } catch (callError) {
      return res.status(callError.status || 502).json({
        error: callError.message,
        ...(config.debug && callError.requestSnapshot ? { debug: { request: callError.requestSnapshot } } : {}),
      });
    }
    const { response, rawBody, requestSnapshot } = call;
    // Truncated raw ERP response, surfaced in the error `detail` for troubleshooting
    // (e.g. the ERP rejecting the request body or using an unexpected JSON shape).
    const rawSnippet = () => rawBody.toString('utf8').slice(0, 500);
    const debugPayload = () => (config.debug ? { debug: { request: requestSnapshot, response: responseSnapshot(response, rawBody) } } : {});
    if (!response.ok) return res.status(502).json({ error: `Το ERP API επέστρεψε HTTP ${response.status}`, detail: rawSnippet(), ...debugPayload() });
    const payload = parseEncodedJson(rawBody, {
      encoding: config.response_encoding || 'auto',
      contentType: response.headers.get('content-type'),
    }).value;
    const configuredPath = String(config.response_path || 'data.lines').trim();
    let lines = configuredPath.split('.').filter(Boolean).reduce((value, key) => value?.[key], payload);
    // ERP responses commonly wrap the line array in { data: { lines: [...] } }.
    // Keep the configured path authoritative, but accept this standard envelope
    // when older settings still contain the legacy `lines` path.
    if (!Array.isArray(lines) && configuredPath === 'lines') lines = payload?.data?.lines;
    if (!Array.isArray(lines)) lines = payload?.data?.lines || payload?.lines || (Array.isArray(payload?.data) ? payload.data : lines);
    if (!Array.isArray(lines)) return res.status(502).json({ error: 'Το response του ERP δεν περιέχει array γραμμών στο JSON path που ορίστηκε', detail: rawSnippet(), ...debugPayload() });
    res.json({ lines: mapErpLinesToQuoteLines(lines), ...debugPayload() });
  } catch (err) { next(err); }
});

// Dry-run render of a fetch-lines (quote_api) body template against sample
// data, without calling the real ERP endpoint. Mirrors /push-preview, used by
// the "Δοκιμή template με δείγμα" button in Settings.
quotesRouter.post('/fetch-preview', authorize(PERMISSIONS.QUOTES_FETCH_LINES), async (req, res, next) => {
  try {
    const sample = {
      customerId: 15, customerErpId: 'C-100', customerCode: 'C015', customerName: 'Δοκιμαστικός πελάτης', customerCompany: 'Acme ΑΕ',
      customerTaxId: '123456789', customerEmail: 'test@acme.gr', customerPhone: '2101234567',
      branchId: 4, branchErpId: 'B-55', branchCode: 'B004', branchName: 'Κεντρικό', branchCity: 'Αθήνα', branchAddress: 'Λ. Συγγρού 1',
      series: '7001', quoteNumber: 42, quoteDate: new Date().toISOString().slice(0, 10), validUntil: new Date().toISOString().slice(0, 10),
      paymentTerms: 'Επί Πίστωση', sellerId: 3,
      referenceStartYear: new Date().getFullYear(), referenceEndYear: new Date().getFullYear() + 1, paymentDueDate: new Date().toISOString().slice(0, 10),
    };
    const rendered = renderPushTemplate(req.body?.template, sample);
    res.json({ rendered });
  } catch (err) { res.status(400).json({ error: `Μη έγκυρο template: ${err.message}` }); }
});

quotesRouter.post('/', authorize(PERMISSIONS.QUOTES_CREATE), async (req, res, next) => {
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
    for (const line of lines) await insertQuoteLine(r.rows.insertId, line);
    await logAuditFromReq(query, req, {
      action: 'create', entityType: 'quote', entityId: r.rows.insertId, customerId: b.customerId,
      summary: `Δημιουργία προσφοράς ${b.series || 'ΠΡΟΣ'}-${number}`,
    });
    const customerRow = (await query('SELECT full_name FROM customers WHERE id = ? AND tenant_id = ?', [b.customerId, req.user.tenantId])).rows[0];
    await evaluateNotificationRules('quote_created', {
      tenantId: req.user.tenantId,
      entityId: r.rows.insertId,
      customerId: b.customerId,
      customerName: customerRow?.full_name,
      total: calculated.total,
      createdByUserId: req.user.id,
      sellerEmployeeId: b.sellerId || null,
    }).catch((e) => console.error('[notificationRules]', e.message));
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
    for (const line of lines) await insertQuoteLine(id, line);
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
    const customerId = (await query('SELECT customer_id FROM quotes WHERE id = ?', [id])).rows[0].customer_id;
    await logActivity({ tenantId: req.user.tenantId, customerId, type: 'quote_status_changed', description: `Προσφορά ${id}: ${quote.status} → ${nextStatus}`, details: { actor: { id: req.user.id } } });
    await logAuditFromReq(query, req, {
      action: 'status', entityType: 'quote', entityId: id, customerId,
      summary: `Κατάσταση προσφοράς ${id}: ${quote.status} → ${nextStatus}`,
      details: { from: quote.status, to: nextStatus },
    });
    const quoteRow = (await query(
      'SELECT q.total, q.created_by, q.seller_id, c.full_name AS customer_name FROM quotes q JOIN customers c ON c.id = q.customer_id WHERE q.id = ?',
      [id],
    )).rows[0];
    await evaluateNotificationRules('quote_status_changed', {
      tenantId: req.user.tenantId,
      entityId: id,
      customerId,
      fromStatus: quote.status,
      toStatus: nextStatus,
      customerName: quoteRow?.customer_name,
      total: quoteRow?.total,
      createdByUserId: quoteRow?.created_by || null,
      sellerEmployeeId: quoteRow?.seller_id || null,
    }).catch((e) => console.error('[notificationRules]', e.message));
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
    `SELECT q.*, c.full_name AS customer_name, c.company, c.email AS customer_email, c.erp_id AS customer_erp_id,
            b.name AS branch_name, b.erp_id AS branch_erp_id
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

// Builds the flat + `lines` data object available to {{placeholders}} in
// quote_push_api.body_template — mirrors ENTITY_TEMPLATE_FIELDS in pushSync.js
// but for the quotes/quote_lines domain.
function quotePushData(quote) {
  return {
    quoteId: quote.id, series: quote.series, quoteNumber: quote.quote_number,
    quoteDate: quote.quote_date ? String(quote.quote_date).slice(0, 10) : null,
    validUntil: quote.valid_until ? String(quote.valid_until).slice(0, 10) : null,
    status: quote.status,
    customerId: quote.customer_id, customerErpId: quote.customer_erp_id || null,
    customerName: quote.customer_name, customerCompany: quote.company,
    branchId: quote.branch_id || null, branchErpId: quote.branch_erp_id || null, branchName: quote.branch_name || null,
    sellerId: quote.seller_id || null,
    paymentTerms: quote.payment_terms, paymentDueDate: quote.payment_due_date ? String(quote.payment_due_date).slice(0, 10) : null,
    referenceStartYear: quote.reference_start_year || null, referenceEndYear: quote.reference_end_year || null,
    subtotal: Number(quote.subtotal || 0), taxTotal: Number(quote.tax_total || 0), total: Number(quote.total || 0),
    lines: (quote.lines || []).map((line) => ({
      description: line.description, quantity: Number(line.quantity || 0), unitPrice: Number(line.unit_price || 0),
      discountPercent: Number(line.discount_percent || 0), taxPercent: Number(line.tax_percent || 0), lineTotal: Number(line.line_total || 0),
    })),
  };
}

quotesRouter.post('/push-preview', authorize(PERMISSIONS.QUOTES_SEND_ERP), async (req, res, next) => {
  try {
    const sampleLines = [{ description: 'Ενδεικτική γραμμή', quantity: 2, unit_price: 50, discount_percent: 0, tax_percent: 24, line_total: 124 }];
    const sample = quotePushData({
      id: 1, series: '7001', quote_number: 42, quote_date: new Date(), valid_until: new Date(), status: 'ready',
      customer_id: 10, customer_erp_id: 'C-100', customer_name: 'Δοκιμαστικός πελάτης', company: 'Acme ΑΕ',
      branch_id: 20, branch_erp_id: 'B-5', branch_name: 'Κεντρικό',
      seller_id: 3, payment_terms: 'Επί Πίστωση', payment_due_date: new Date(),
      reference_start_year: new Date().getFullYear(), reference_end_year: new Date().getFullYear() + 1,
      subtotal: 100, tax_total: 24, total: 124, lines: sampleLines,
    });
    const rendered = renderPushTemplate(req.body?.template, sample);
    res.json({ rendered });
  } catch (err) { res.status(400).json({ error: `Μη έγκυρο template: ${err.message}` }); }
});

quotesRouter.post('/:id/push-erp', authorize(PERMISSIONS.QUOTES_SEND_ERP), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const quote = await loadQuote(id, req.user.tenantId);
    if (!quote) return res.status(404).json({ error: 'Η προσφορά δεν βρέθηκε' });
    const settings = (await query('SELECT settings FROM tenants WHERE id = ?', [req.user.tenantId])).rows[0]?.settings;
    const config = mergeTenantSettings(settings).quote_push_api;
    if (!config?.url) return res.status(422).json({ error: 'Δεν έχει ρυθμιστεί URL στο Ρυθμίσεις → Προσφορές / ERP API' });
    let rendered;
    try {
      rendered = renderPushTemplate(config.body_template, quotePushData(quote));
    } catch (templateError) {
      return res.status(422).json({ error: `Μη έγκυρο body template: ${templateError.message}` });
    }
    const headers = parseJson(config.headers, {});
    let call;
    try {
      call = await callConfiguredErp(config, headers, rendered);
    } catch (callError) {
      await query('UPDATE quotes SET erp_push_status = ?, erp_push_error = ? WHERE id = ? AND tenant_id = ?', ['failed', callError.message, id, req.user.tenantId]);
      return res.status(callError.status || 502).json({
        error: callError.message,
        ...(config.debug && callError.requestSnapshot ? { debug: { request: callError.requestSnapshot } } : {}),
      });
    }
    const { response, rawBody, requestSnapshot } = call;
    const raw = rawBody.toString('utf8');
    const debugPayload = () => (config.debug ? { debug: { request: requestSnapshot, response: responseSnapshot(response, rawBody) } } : {});
    if (!response.ok) {
      await query('UPDATE quotes SET erp_push_status = ?, erp_push_error = ? WHERE id = ? AND tenant_id = ?', ['failed', `HTTP ${response.status}: ${raw.slice(0, 500)}`, id, req.user.tenantId]);
      return res.status(502).json({ error: `Το ERP API επέστρεψε HTTP ${response.status}`, detail: raw.slice(0, 500), ...debugPayload() });
    }
    let erpId = null;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      erpId = parsed ? getPath(parsed, config.response_id_path || 'id') : null;
    } catch { /* non-JSON response, skip erp_id capture */ }
    await query(
      'UPDATE quotes SET erp_id = COALESCE(?, erp_id), erp_pushed_at = NOW(), erp_push_status = ?, erp_push_error = NULL WHERE id = ? AND tenant_id = ?',
      [erpId != null ? String(erpId) : null, 'sent', id, req.user.tenantId]);
    await logActivity({ tenantId: req.user.tenantId, customerId: quote.customer_id, type: 'quote_pushed_erp', description: `Αποστολή προσφοράς ${quote.series}-${quote.quote_number} στο ERP`, details: { actor: { id: req.user.id }, quote_id: id, erp_id: erpId } });
    await logAuditFromReq(query, req, {
      action: 'push_erp', entityType: 'quote', entityId: id, customerId: quote.customer_id,
      summary: `Αποστολή προσφοράς ${quote.series}-${quote.quote_number} στο ERP`,
      details: { erp_id: erpId },
    });
    res.json({ id, erp_id: erpId, status: 'sent', ...debugPayload() });
  } catch (err) { next(err); }
});
