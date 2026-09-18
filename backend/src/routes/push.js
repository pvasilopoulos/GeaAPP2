import { Router } from 'express';
import { config } from '../config.js';
import {
  pushEnabled, saveSubscription, removeSubscription, subscriptionCountForUser,
} from '../lib/push.js';

export const pushRouter = Router();

pushRouter.get('/public-key', (_req, res) => {
  res.json({ publicKey: pushEnabled() ? config.push.publicKey : null });
});

pushRouter.get('/status', async (req, res, next) => {
  try {
    const count = await subscriptionCountForUser({ tenantId: req.user.tenantId, userId: req.user.id });
    res.json({ enabled: pushEnabled(), subscriptions: count });
  } catch (e) { next(e); }
});

pushRouter.post('/subscribe', async (req, res, next) => {
  try {
    if (!pushEnabled()) return res.status(503).json({ error: 'Οι push ειδοποιήσεις δεν έχουν ρυθμιστεί στον server' });
    await saveSubscription({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      subscription: req.body?.subscription,
      userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    next(e);
  }
});

pushRouter.post('/unsubscribe', async (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint απαιτείται' });
    const result = await removeSubscription({ tenantId: req.user.tenantId, userId: req.user.id, endpoint });
    res.json({ ok: true, removed: result.removed });
  } catch (e) { next(e); }
});
