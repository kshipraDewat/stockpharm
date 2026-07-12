import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { createRetailSale, listRetailSales, getRetailSaleDetail, voidRetailSale } from '../services/retailSaleService.js';

const router = Router();
router.use(authenticate, requireTenantType('pharmacy'));

router.get('/', async (req, res, next) => {
  try {
    const { search, status, dateFrom, dateTo, page, pageSize } = req.query as Record<string, string>;
    const result = await listRetailSales(req.user.tenantId, {
      search, status, dateFrom, dateTo,
      page: parseInt(page ?? '1', 10),
      pageSize: parseInt(pageSize ?? '20', 10),
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await getRetailSaleDetail(req.user.tenantId, req.params.id);
    if (!result) { res.status(404).json({ error: 'Sale not found' }); return; }
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'pharmacist', 'cashier'), auditMiddleware('retail_sale'), async (req, res, next) => {
  try {
    const body = z.object({
      saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      customerId: z.string().uuid().optional(),
      paymentMethod: z.enum(['cash', 'upi', 'card']),
      amountReceived: z.number().nonnegative().optional(),
      notes: z.string().optional(),
      paymentBreakdown: z.array(z.object({
        method: z.enum(['cash', 'upi', 'card']),
        amount: z.number().positive(),
      })).optional(),
      // C26: prescription fields (validated server-side based on item schedule).
      rxNumber: z.string().optional(),
      doctorName: z.string().optional(),
      doctorRegNo: z.string().optional(),
      patientName: z.string().optional(),
      patientAge: z.number().int().min(0).max(150).optional(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        batchId: z.string().uuid().optional(),
        qty: z.number().int().positive(),
        rate: z.number().positive().optional(),
        discountPercent: z.number().min(0).max(100).optional(),
      })).min(1),
    }).parse(req.body);
    const result = await createRetailSale(req.user.tenantId, req.user.sub, body);
    res.status(201).json(result);
  } catch (e: any) {
    const code = e.message?.split(':')[0];
    if (code === 'EXPIRED_BATCH' || code === 'INSUFFICIENT_STOCK' || code === 'RX_REQUIRED' || code === 'BATCH_NOT_AVAILABLE' || code === 'SPLIT_MISMATCH') {
      res.status(code === 'INSUFFICIENT_STOCK' ? 409 : 400).json({
        error: e.message.split(':').slice(1).join(':') || e.message,
        code,
      });
      return;
    }
    next(e);
  }
});

router.post('/:id/void', requireRole('admin'), auditMiddleware('retail_sale'), async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(req.body);
    const result = await voidRetailSale(req.user.tenantId, req.params.id, req.user.sub, reason);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
