import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { recordSupplierPayment, listSupplierPayments } from '../services/supplierPaymentService.js';

const router = Router();
router.use(authenticate, requireTenantType('stockist'));

router.get('/', async (req, res, next) => {
  try {
    const { supplierId, page, pageSize } = req.query as Record<string, string>;
    const result = await listSupplierPayments(req.user.tenantId, {
      supplierId,
      page: parseInt(page ?? '1'),
      pageSize: parseInt(pageSize ?? '20'),
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), auditMiddleware('payment'), async (req, res, next) => {
  try {
    const body = z.object({
      supplierId: z.string().uuid(),
      paymentDate: z.string(),
      method: z.enum(['cash', 'upi', 'bank', 'cheque']),
      referenceNo: z.string().optional(),
      amount: z.number().positive(),
      notes: z.string().optional(),
    }).parse(req.body);
    const result = await recordSupplierPayment(req.user.tenantId, req.user.sub, body);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

export default router;
