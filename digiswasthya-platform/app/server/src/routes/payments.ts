import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { recordPayment, listPayments, voidPayment } from '../services/paymentService.js';
import { getDb } from '../db/client.js';
import { payments, paymentAllocations, bills } from '../db/schema.js';
import { eq, and, ne } from 'drizzle-orm';

const router = Router();
router.use(authenticate, requireTenantType('stockist'));

router.get('/check-reference', async (req, res, next) => {
  try {
    const { ref } = req.query as { ref?: string };
    if (!ref?.trim()) { res.json({ exists: false }); return; }
    const db = await getDb();
    const existing = await db.query.payments.findFirst({
      where: and(
        eq(payments.tenantId, req.user.tenantId),
        eq(payments.referenceNo, ref.trim()),
        ne(payments.status, 'voided'),
      ),
    });
    res.json({ exists: !!existing, paymentNumber: existing?.paymentNumber ?? null });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const { pharmacyId, search, page, pageSize } = req.query as Record<string, string>;
    const result = await listPayments(req.user.tenantId, { pharmacyId, search, page: parseInt(page ?? '1'), pageSize: parseInt(pageSize ?? '20') });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const payment = await db.query.payments.findFirst({ where: and(eq(payments.id, req.params.id), eq(payments.tenantId, req.user.tenantId)) });
    if (!payment) { res.status(404).json({ error: 'Payment not found' }); return; }
    const allocs = await db.select({ billId: paymentAllocations.billId, allocatedAmount: paymentAllocations.allocatedAmount, billNumber: bills.billNumber })
      .from(paymentAllocations).leftJoin(bills, eq(paymentAllocations.billId, bills.id)).where(eq(paymentAllocations.paymentId, req.params.id));
    res.json({ ...payment, allocations: allocs });
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'biller'), auditMiddleware('payment'), async (req, res, next) => {
  try {
    const body = z.object({
      pharmacyId: z.string().uuid(),
      paymentDate: z.string(),
      method: z.enum(['cash', 'upi', 'bank', 'cheque']),
      referenceNo: z.string().optional(),
      amount: z.number().positive(),
      notes: z.string().optional(),
      allocations: z.array(z.object({ billId: z.string().uuid(), amount: z.number().positive() })).optional(),
    }).parse(req.body);
    const result = await recordPayment(req.user.tenantId, req.user.sub, body);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/:id/void', requireRole('admin'), auditMiddleware('payment'), async (req, res, next) => {
  try {
    const result = await voidPayment(req.user.tenantId, req.params.id, req.user.sub);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
