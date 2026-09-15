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

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_BYTES = 5 * 1024 * 1024;

// POST /api/uploads — { mime, data } where data is base64 (no data-URL prefix required).
uploadsRouter.post('/', async (req, res, next) => {
  try {
    const mime = String(req.body?.mime || '').toLowerCase();
    const ext = MIME_EXT[mime];
    if (!ext) return res.status(400).json({ error: 'Επιτρέπονται μόνο εικόνες JPEG, PNG, WebP ή GIF' });
    let raw = String(req.body?.data || '');
    const comma = raw.indexOf(',');
    if (raw.startsWith('data:') && comma !== -1) raw = raw.slice(comma + 1);
    const buf = Buffer.from(raw, 'base64');
    if (!buf.length) return res.status(400).json({ error: 'Κενό αρχείο' });
    if (buf.length > MAX_BYTES) return res.status(400).json({ error: 'Το αρχείο ξεπερνά τα 5 MB' });

    await mkdir(UPLOADS_DIR, { recursive: true });
    const name = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
    await writeFile(path.join(UPLOADS_DIR, name), buf);
    res.status(201).json({ url: `/uploads/${name}` });
  } catch (err) { next(err); }
});
