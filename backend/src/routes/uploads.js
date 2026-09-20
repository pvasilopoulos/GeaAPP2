import { Router } from 'express';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { query } from '../db.js';

export const uploadsRouter = Router();
uploadsRouter.use(authorize(PERMISSIONS.CUSTOMERS_WRITE));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
  'application/zip': 'zip',
};
const MAX_BYTES = 5 * 1024 * 1024;

function safePathSegment(value, fallback) {
  const segment = String(value || '')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100);
  return segment || fallback;
}

// Generates a short, random stored file name — kept well under 15 characters
// (including the extension) so it never bumps into providers' own file-name
// length limits (e.g. Viber/Routee's 25-character viberFile name limit).
// The user's original file name is never embedded here; it's preserved
// separately as the attachment's display name, so nothing is lost.
async function uniqueFileName(targetDir, ext) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const name = `${randomBytes(4).toString('hex')}.${ext}`;
    try {
      await access(path.join(targetDir, name));
    } catch {
      return name; // doesn't exist yet — safe to use
    }
  }
  // Extremely unlikely fallback after repeated collisions: widen the random part.
  return `${randomBytes(6).toString('hex')}.${ext}`;
}

// POST /api/uploads — { mime, data } where data is base64 (no data-URL prefix required).
uploadsRouter.post('/', async (req, res, next) => {
  try {
    const mime = String(req.body?.mime || '').toLowerCase();
    const ext = MIME_EXT[mime];
    if (!ext) return res.status(400).json({ error: 'Μη υποστηριζόμενος τύπος αρχείου' });
    let raw = String(req.body?.data || '');
    const comma = raw.indexOf(',');
    if (raw.startsWith('data:') && comma !== -1) raw = raw.slice(comma + 1);
    const buf = Buffer.from(raw, 'base64');
    if (!buf.length) return res.status(400).json({ error: 'Κενό αρχείο' });
    if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ error: 'Το αρχείο ξεπερνά τα 20 MB' });

    let relativeDir = '';
    if (req.body?.customerId !== undefined && req.body?.customerId !== null) {
      const customerId = Number(req.body.customerId);
      if (!Number.isInteger(customerId) || customerId <= 0) return res.status(400).json({ error: 'Μη έγκυρος πελάτης' });
      const customer = (await query(
        'SELECT code FROM customers WHERE id = ? AND tenant_id = ?',
        [customerId, req.user.tenantId],
      )).rows[0];
      if (!customer) return res.status(404).json({ error: 'Ο πελάτης δεν βρέθηκε' });
      relativeDir = path.join('Customer', safePathSegment(customer.code, `customer-${customerId}`));
    }
    const targetDir = path.join(UPLOADS_DIR, relativeDir);
    await mkdir(targetDir, { recursive: true });
    // Stored file name is short and random on purpose — the user's own file
    // name is preserved separately as the attachment's display name, so it
    // doesn't need to (and shouldn't, per the 15-char limit) live on disk.
    const name = await uniqueFileName(targetDir, ext);
    await writeFile(path.join(targetDir, name), buf);
    const urlPath = relativeDir ? `${relativeDir.replace(/\\/g, '/')}/${name}` : name;
    res.status(201).json({ url: `/uploads/${urlPath}`, path: urlPath });
  } catch (err) { next(err); }
});
