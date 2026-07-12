import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { listReturns, processReturn, rejectReturn } from '../services/returnService.js';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { returns, returnItems, products, bills, orders, pharmacies, productBatches } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const router = Router();
router.use(authenticate, requireTenantType('stockist'));

router.get('/', async (req, res, next) => {
  try {
    const { pharmacyId, search, source, page, pageSize } = req.query as Record<string, string>;
    const result = await listReturns(req.user.tenantId, {
      pharmacyId, search, source, page: parseInt(page ?? '1'), pageSize: parseInt(pageSize ?? '20'),
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const ret = await db.query.returns.findFirst({ where: and(eq(returns.id, req.params.id), eq(returns.tenantId, req.user.tenantId)) });
    if (!ret) { res.status(404).json({ error: 'Return not found' }); return; }
    const items = await db.select({
      id: returnItems.id, productId: returnItems.productId, qty: returnItems.qty,
      rate: returnItems.rate, gstRate: returnItems.gstRate, lineTotal: returnItems.lineTotal,
      productName: products.name, batchNumber: productBatches.batchNumber,
    }).from(returnItems)
      .leftJoin(products, eq(returnItems.productId, products.id))
      .leftJoin(productBatches, eq(returnItems.batchId, productBatches.id))
      .where(eq(returnItems.returnId, req.params.id));

    const pharmacy = await db.query.pharmacies.findFirst({ where: eq(pharmacies.id, ret.pharmacyId) });
    let orderNumber: string | null = null;
    let billNumber: string | null = null;
    if (ret.orderId) {
      const order = await db.query.orders.findFirst({ where: eq(orders.id, ret.orderId) });
      orderNumber = order?.orderNumber ?? null;
      const bill = await db.query.bills.findFirst({ where: eq(bills.orderId, ret.orderId) });
      billNumber = bill?.billNumber ?? null;
    }

    res.json({
      ...ret,
      items,
      pharmacyName: pharmacy?.name,
      orderNumber,
      billNumber,
    });
  } catch (e) { next(e); }
});

router.post('/:id/process', requireRole('admin'), auditMiddleware('return'), async (req, res, next) => {
  try {
    const result = await processReturn(req.user.tenantId, req.params.id, req.user.sub);
    res.json(result);
  } catch (e) { next(e); }
});

// M12: explicit reject path so the pharmacy can see why the return was refused.
router.post('/:id/reject', requireRole('admin'), auditMiddleware('return'), async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(req.body);
    const result = await rejectReturn(req.user.tenantId, req.params.id, req.user.sub, reason);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
