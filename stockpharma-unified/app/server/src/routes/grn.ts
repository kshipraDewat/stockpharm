import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { createGrn, listGrns, getGrnDetail } from '../services/pharmacyGrnService.js';

const router = Router();
router.use(authenticate, requireTenantType('pharmacy'));

// M22: in-memory idempotency window so a retried POST doesn't double-receive.
// (Per-process is enough for prototype; a persisted table would survive restarts.)
const IDEMPOTENCY_WINDOW_MS = 10 * 60_000;
const idempotencyCache = new Map<string, { at: number; result: unknown }>();
function gcIdempotency() {
  const now = Date.now();
  for (const [k, v] of idempotencyCache) {
    if (now - v.at > IDEMPOTENCY_WINDOW_MS) idempotencyCache.delete(k);
  }
}

router.get('/', async (req, res, next) => {
  try {
    const { search, stockistConnectionId, page, pageSize } = req.query as Record<string, string>;
    const result = await listGrns(req.user.tenantId, {
      search, stockistConnectionId,
      page: parseInt(page ?? '1', 10),
      pageSize: parseInt(pageSize ?? '20', 10),
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await getGrnDetail(req.user.tenantId, req.params.id);
    if (!result) { res.status(404).json({ error: 'GRN not found' }); return; }
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'pharmacist'), auditMiddleware('pharmacy_grn'), async (req, res, next) => {
  try {
    const body = z.object({
      purchaseOrderId: z.string().uuid(),
      receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: z.string().optional(),
      items: z.array(z.object({
        purchaseOrderItemId: z.string().uuid().optional(),
        productId: z.string().uuid(),
        batchNumber: z.string().min(1),
        expiryDate: z.string().min(1),
        qty: z.number().int().nonnegative(),
        freeQty: z.number().int().nonnegative().optional(),
        mrp: z.number().positive(),
        purchaseRate: z.number().positive(),
        saleRate: z.number().positive(),
      })).min(1).refine(
        items => items.every(i => i.qty + (i.freeQty ?? 0) >= 1),
        { message: 'Each line must have qty + freeQty >= 1' },
      ),
    }).parse(req.body);

    // M22: idempotency-key short-circuit
    gcIdempotency();
    const key = req.header('Idempotency-Key');
    if (key) {
      const k = `${req.user.tenantId}:${key}`;
      const cached = idempotencyCache.get(k);
      if (cached) {
        res.status(200).json(cached.result);
        return;
      }
      const result = await createGrn(req.user.tenantId, req.user.sub, body);
      idempotencyCache.set(k, { at: Date.now(), result });
      res.status(201).json(result);
      return;
    }
    const result = await createGrn(req.user.tenantId, req.user.sub, body);
    res.status(201).json(result);
  } catch (e: any) {
    if (e.message?.startsWith('EXPIRED_BATCH')) {
      res.status(400).json({ error: e.message.split(':').slice(1).join(':'), code: 'EXPIRED_BATCH' });
      return;
    }
    if (e.message?.startsWith('OVER_RECEIVE')) {
      res.status(400).json({ error: e.message.split(':').slice(1).join(':'), code: 'OVER_RECEIVE' });
      return;
    }
    next(e);
  }
});

export default router;
