import { Router } from 'express';
import { listPublicStockists, getPublicStockistBySlug, getPublicCatalog } from '../services/publicCatalogService.js';
import { verifyBill } from '../services/billVerificationService.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();
// M44: IP-based rate limit on every public catalog endpoint
router.use(rateLimit({ windowMs: 60_000, max: 60 }));

// Public bill verification (UNIFIED "/verify-bill/{id}"). Returns only
// non-sensitive fields for QR/recipient authenticity checks; 404 if unknown.
router.get('/verify-bill/:id', async (req, res, next) => {
  try {
    const result = await verifyBill(req.params.id);
    if (!result) { res.status(404).json({ verified: false, error: 'Bill not found' }); return; }
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/stockists', async (req, res, next) => {
  try {
    const { dedupePublicStockistListings } = await import('../services/publicCatalogService.js');
    await dedupePublicStockistListings().catch(() => {});
    const result = await listPublicStockists({
      state: req.query.state as string | undefined,
      category: req.query.category as string | undefined,
      q: req.query.q as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/stockists/:slug', async (req, res, next) => {
  try {
    const profile = await getPublicStockistBySlug(req.params.slug);
    if (!profile) { res.status(404).json({ error: 'Stockist not found' }); return; }
    res.json(profile);
  } catch (e) { next(e); }
});

router.get('/stockists/:slug/catalog', async (req, res, next) => {
  try {
    const result = await getPublicCatalog(req.params.slug, {
      q: req.query.q as string | undefined,
      category: req.query.category as string | undefined,
      page: req.query.page ? Number(req.query.page) : 1,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
    });
    if (!result) { res.status(404).json({ error: 'Stockist not found' }); return; }
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/demo-credentials', async (_req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    res.status(404).json({ error: 'Not available' });
    return;
  }
  const { DEMO_USERS } = await import('../services/devBootstrap.js');
  res.json({
    panels: Object.entries(DEMO_USERS).map(([role, u]) => ({
      role,
      email: u.email,
      password: u.password,
      loginPath: u.loginPath,
    })),
  });
});

export default router;
