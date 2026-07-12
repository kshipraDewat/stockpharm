import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { recordPayablePayment, listPayablePayments, voidPayablePayment } from '../services/payablePaymentService.js';

const router = Router();
router.use(authenticate, requireTenantType('pharmacy'));

router.get('/', async (req, res, next) => {
  try {
    const { stockistConnectionId, method, status, from, to, search, page, pageSize } = req.query as Record<string, string>;
    const result = await listPayablePayments(req.user.tenantId, {
      stockistConnectionId, method, status, from, to, search,
      page: parseInt(page ?? '1', 10),
      pageSize: parseInt(pageSize ?? '20', 10),
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'pharmacist'), auditMiddleware('payable_payment'), async (req, res, next) => {
  try {
    const body = z.object({
      stockistConnectionId: z.string().uuid(),
      paymentDate: z.string(),
      method: z.enum(['cash', 'upi', 'bank', 'cheque']),
      referenceNo: z.string().optional(),
      amount: z.number().positive(),
      notes: z.string().optional(),
      allocations: z.array(z.object({
        billId: z.string().uuid(),
        amount: z.number().positive(),
      })).optional(),
    }).parse(req.body);
    const result = await recordPayablePayment(req.user.tenantId, req.user.sub, body);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/:id/void', requireRole('admin'), auditMiddleware('payable_payment'), async (req, res, next) => {
  try {
    const result = await voidPayablePayment(req.user.tenantId, req.params.id, req.user.sub);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
