import { Router } from 'express';
import { authorize } from '../middleware/auth.js';
import { PERMISSIONS } from '../lib/permissions.js';

export const geoRouter = Router();
geoRouter.use(authorize(PERMISSIONS.CUSTOMERS_READ));

// GET /api/geo/lookup?q= — Nominatim geocode (address → lat/lng).
geoRouter.get('/lookup', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.status(400).json({ error: 'Δώστε διεύθυνση' });
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'SpaceHub/1.0 (customer-management)', 'Accept-Language': 'el,en' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(502).json({ error: 'Αποτυχία γεωκωδικοποίησης' });
    const rows = await r.json();
    const hit = Array.isArray(rows) && rows[0];
    if (!hit) return res.json({ lat: null, lng: null, displayName: null });
    res.json({
      lat: Number(hit.lat),
      lng: Number(hit.lon),
      displayName: hit.display_name || null,
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return res.status(504).json({ error: 'Η γεωκωδικοποίηση άργησε πολύ' });
    }
    next(err);
  }
});
