import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import {
  createStockistReturn, listStockistReturns, getStockistReturnDetail,
} from '../services/stockistReturnService.js';

const router = Router();
router.use(authenticate, requireTenantType('pharmacy'));

router.get('/', async (req, res, next) => {
  try {
    const { stockistConnectionId, page, pageSize } = req.query as Record<string, string>;
    const result = await listStockistReturns(req.user.tenantId, {
      stockistConnectionId,
      page: parseInt(page ?? '1', 10),
      pageSize: parseInt(pageSize ?? '20', 10),
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await getStockistReturnDetail(req.user.tenantId, req.params.id);
    if (!result) { res.status(404).json({ error: 'Return not found' }); return; }
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'pharmacist'), auditMiddleware('stockist_return'), async (req, res, next) => {
  try {
    const body = z.object({
      stockistConnectionId: z.string().uuid(),
      purchaseOrderId: z.string().uuid().optional(),
      payableBillId: z.string().uuid().optional(),
      returnDate: z.string(),
      reason: z.enum(['expired', 'damaged', 'wrong_item', 'cancelled', 'other']).default('other'),
      notes: z.string().optional(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        batchId: z.string().uuid().optional(),
        qty: z.number().int().positive(),
        rate: z.number().positive(),
        gstRate: z.number().nonnegative(),
      })).min(1),
    }).parse(req.body);
    const result = await createStockistReturn(req.user.tenantId, req.user.sub, body);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

export default router;
