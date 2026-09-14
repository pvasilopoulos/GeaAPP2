import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { query } from '../db.js';
import { buildFilters, resolveSort } from '../lib/customerFilters.js';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT = path.resolve(__dirname, '../../assets/fonts/DejaVuSans.ttf');
const FONT_BOLD = path.resolve(__dirname, '../../assets/fonts/DejaVuSans-Bold.ttf');

const STATUS = { active: 'Ενεργός', inactive: 'Ανενεργός', prospect: 'Υποψήφιος' };
const TYPE = { individual: 'Ιδιώτης', company: 'Εταιρεία' };
// Per-format row caps (PDF/Excel are heavier than CSV).
const CAPS = { csv: 50000, xlsx: 20000, pdf: 2000 };

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}

export const exportRouter = Router();

// GET /api/customers/export?format=csv|xlsx|pdf&<same filters as search>
exportRouter.get('/export', authorize(PERMISSIONS.CUSTOMERS_EXPORT), async (req, res, next) => {
  try {
    const format = ['csv', 'xlsx', 'pdf'].includes(req.query.format) ? req.query.format : 'csv';
    const { params, where } = buildFilters(req);
    const { cfg, idDir } = resolveSort(req);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT c.code, c.full_name, c.company, c.customer_type, c.city, c.status,
              c.branches_count, c.spaces_count, c.bookings_count, c.total_value, c.last_visit_at,
              e.full_name AS assigned_employee
       FROM customers c LEFT JOIN employees e ON e.id = c.assigned_employee_id
       ${whereSql}
       ORDER BY ${cfg.expr} ${cfg.dir}, c.id ${idDir}
       LIMIT ${CAPS[format]}`, params);

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') return sendCsv(res, rows, stamp);
    if (format === 'xlsx') return sendXlsx(res, rows, stamp);
    return sendPdf(res, rows, stamp);
  } catch (err) {
    next(err);
  }
});

// ---- CSV ------------------------------------------------------------------
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function sendCsv(res, rows, stamp) {
  const headers = ['Κωδικός', 'Ονοματεπώνυμο', 'Εταιρεία/Τύπος', 'Πόλη', 'Κατάσταση',
    'Υποκαταστήματα', 'Χώροι', 'Κρατήσεις', 'Συνολική αξία', 'Τελ. επίσκεψη', 'Υπεύθυνος'];
  const lines = [headers.join(';')];
  for (const r of rows) {
    lines.push([
      r.code, r.full_name, r.company || TYPE[r.customer_type] || '', r.city || '',
      STATUS[r.status] || r.status, r.branches_count, r.spaces_count, r.bookings_count,
      Number(r.total_value), fmtDate(r.last_visit_at), r.assigned_employee || '',
    ].map(csvCell).join(';'));
  }
  // UTF-8 BOM so Excel renders Greek correctly; ';' matches el locale.
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="customers_${stamp}.csv"`);
  res.send('\ufeff' + lines.join('\r\n'));
}

// ---- Excel (.xlsx) --------------------------------------------------------
async function sendXlsx(res, rows, stamp) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Πελάτες');
  ws.columns = [
    { header: 'Κωδικός', key: 'code', width: 14 },
    { header: 'Ονοματεπώνυμο', key: 'name', width: 26 },
    { header: 'Εταιρεία/Τύπος', key: 'company', width: 24 },
    { header: 'Πόλη', key: 'city', width: 16 },
    { header: 'Κατάσταση', key: 'status', width: 14 },
    { header: 'Υποκαταστήματα', key: 'branches', width: 16 },
    { header: 'Χώροι', key: 'spaces', width: 10 },
    { header: 'Κρατήσεις', key: 'bookings', width: 12 },
    { header: 'Συνολική αξία', key: 'value', width: 16 },
    { header: 'Τελ. επίσκεψη', key: 'lastvisit', width: 16 },
    { header: 'Υπεύθυνος', key: 'employee', width: 22 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  head.alignment = { vertical: 'middle' };
  for (const r of rows) {
    ws.addRow({
      code: r.code, name: r.full_name, company: r.company || TYPE[r.customer_type] || '',
      city: r.city || '', status: STATUS[r.status] || r.status,
      branches: r.branches_count, spaces: r.spaces_count, bookings: r.bookings_count,
      value: Number(r.total_value), lastvisit: r.last_visit_at ? new Date(r.last_visit_at) : null,
      employee: r.assigned_employee || '',
    });
  }
  ws.getColumn('value').numFmt = '#,##0.00 €';
  ws.getColumn('lastvisit').numFmt = 'dd/mm/yyyy';
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = 'A1:K1';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="customers_${stamp}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

// ---- PDF ------------------------------------------------------------------
function sendPdf(res, rows, stamp) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
  doc.registerFont('R', FONT);
  doc.registerFont('B', FONT_BOLD);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="customers_${stamp}.pdf"`);
  doc.pipe(res);

  const cols = [
    { t: 'Κωδικός', w: 70, a: 'left', k: (r) => r.code },
    { t: 'Ονοματεπώνυμο', w: 150, a: 'left', k: (r) => r.full_name },
    { t: 'Πόλη', w: 95, a: 'left', k: (r) => r.city || '' },
    { t: 'Κατάσταση', w: 78, a: 'left', k: (r) => STATUS[r.status] || r.status },
    { t: 'Υποκ.', w: 48, a: 'right', k: (r) => String(r.branches_count) },
    { t: 'Χώροι', w: 48, a: 'right', k: (r) => String(r.spaces_count) },
    { t: 'Κρατ.', w: 48, a: 'right', k: (r) => String(r.bookings_count) },
    { t: 'Αξία (€)', w: 72, a: 'right', k: (r) => Number(r.total_value).toLocaleString('el-GR') },
    { t: 'Τελ. επίσκεψη', w: 88, a: 'right', k: (r) => fmtDate(r.last_visit_at) },
  ];
  const startX = doc.page.margins.left;
  const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const rowH = 18;
  let y = 0;

  const drawHeader = () => {
    doc.rect(startX, y, usableW, rowH).fill('#f1f2f4');
    doc.fillColor('#1a1d24').font('B').fontSize(8.5);
    let x = startX;
    for (const c of cols) { doc.text(c.t, x + 3, y + 5, { width: c.w - 6, align: c.a, lineBreak: false }); x += c.w; }
    y += rowH;
    doc.font('R').fontSize(8).fillColor('#1a1d24');
  };

  doc.font('B').fontSize(15).fillColor('#14161d').text('SpaceHub — Πελάτες', startX, 22);
  doc.font('R').fontSize(9).fillColor('#5b6270')
    .text(`Εξαγωγή ${rows.length.toLocaleString('el-GR')} εγγραφών · ${fmtDate(new Date())}`, startX, 42);
  y = 62;
  drawHeader();

  for (const r of rows) {
    if (y > doc.page.height - doc.page.margins.bottom - rowH) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
    let x = startX;
    for (const c of cols) {
      doc.text(String(c.k(r) ?? ''), x + 3, y + 4, { width: c.w - 6, align: c.a, lineBreak: false, ellipsis: true });
      x += c.w;
    }
    doc.moveTo(startX, y + rowH).lineTo(startX + usableW, y + rowH).strokeColor('#e7e9ee').lineWidth(0.5).stroke();
    y += rowH;
  }
  doc.end();
}
