import { Router } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';

export const uploadsRouter = Router();
uploadsRouter.use(authorize(PERMISSIONS.CUSTOMERS_WRITE));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

const IMAGE_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
// Message attachments may also be documents; avatars and photos stay images.
const DOC_EXT = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};
const MAX_BYTES = 5 * 1024 * 1024;

function safeName(raw, ext) {
  const base = String(raw || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N} ._-]/gu, '')
    .trim()
    .slice(0, 80);
  return `${base || 'αρχείο'}.${ext}`;
}

async function store(req, res, allowed, rejectMessage) {
  const mime = String(req.body?.mime || '').toLowerCase();
  const ext = allowed[mime];
  if (!ext) return res.status(400).json({ error: rejectMessage });
  let raw = String(req.body?.data || '');
  const comma = raw.indexOf(',');
  if (raw.startsWith('data:') && comma !== -1) raw = raw.slice(comma + 1);
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) return res.status(400).json({ error: 'Κενό αρχείο' });
  if (buf.length > MAX_BYTES) return res.status(400).json({ error: 'Το αρχείο ξεπερνά τα 5 MB' });

  await mkdir(UPLOADS_DIR, { recursive: true });
  const stored = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
  await writeFile(path.join(UPLOADS_DIR, stored), buf);
  return res.status(201).json({
    url: `/uploads/${stored}`,
    name: safeName(req.body?.name, ext),
    mime,
    size: buf.length,
  });
}

// POST /api/uploads — { mime, data } where data is base64 (no data-URL prefix required).
uploadsRouter.post('/', async (req, res, next) => {
  try {
    await store(req, res, IMAGE_EXT, 'Επιτρέπονται μόνο εικόνες JPEG, PNG, WebP ή GIF');
  } catch (err) { next(err); }
});

// POST /api/uploads/attachment — images plus common documents, for messages.
uploadsRouter.post('/attachment', async (req, res, next) => {
  try {
    await store(req, res, { ...IMAGE_EXT, ...DOC_EXT },
      'Επιτρέπονται εικόνες, PDF, Word, Excel, TXT ή CSV');
  } catch (err) { next(err); }
});
