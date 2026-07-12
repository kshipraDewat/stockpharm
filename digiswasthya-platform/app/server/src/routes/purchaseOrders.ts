import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import {
  createPurchaseOrder, updatePurchaseOrder, submitPurchaseOrder,
  cancelPurchaseOrder, deletePurchaseOrder, listPurchaseOrders, getPurchaseOrderDetail,
  confirmPurchaseOrderReceipt,
} from '../services/pharmacyPurchaseOrderService.js';

const router = Router();
router.use(authenticate, requireTenantType('pharmacy'));

const itemSchema = z.object({
  catalogItemId: z.string().uuid().optional(),
  stockistProductId: z.string().uuid(),
  productName: z.string().min(1),
  qty: z.number().int().positive(),
  freeQty: z.number().int().nonnegative().optional(),
  rate: z.number().positive(),
  gstRate: z.number().nonnegative(),
});

router.get('/', async (req, res, next) => {
  try {
    const { search, status, stockistConnectionId, page, pageSize } = req.query as Record<string, string>;
    const result = await listPurchaseOrders(req.user.tenantId, {
      search, status, stockistConnectionId,
      page: parseInt(page ?? '1', 10),
      pageSize: parseInt(pageSize ?? '20', 10),
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await getPurchaseOrderDetail(req.user.tenantId, req.params.id);
    if (!result) { res.status(404).json({ error: 'Purchase order not found' }); return; }
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'pharmacist'), auditMiddleware('pharmacy_purchase_order'), async (req, res, next) => {
  try {
    const body = z.object({
      stockistConnectionId: z.string().uuid(),
      orderDate: z.string(),
      paymentMode: z.enum(['credit', 'cash']).optional(),
      notes: z.string().optional(),
      items: z.array(itemSchema).min(1),
    }).parse(req.body);
    const result = await createPurchaseOrder(req.user.tenantId, req.user.sub, body);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('admin', 'pharmacist'), auditMiddleware('pharmacy_purchase_order'), async (req, res, next) => {
  try {
    const body = z.object({
      orderDate: z.string().optional(),
      paymentMode: z.enum(['credit', 'cash']).optional(),
      notes: z.string().optional(),
      items: z.array(itemSchema).optional(),
    }).parse(req.body);
    const result = await updatePurchaseOrder(req.user.tenantId, req.params.id, body);
    res.json(result);
  } catch (e) { next(e); }
});

// M18: map every typed error code from the service layer to a 400/409 with the
// stable `code` field, so the UI can react predictably.
const SUBMIT_ERROR_STATUS: Record<string, number> = {
  CREDIT_LIMIT_EXCEEDED: 400,
  CONNECTION_INACTIVE: 400,
  PHARMACY_INACTIVE: 400,
  PO_NOT_SUBMITTABLE: 409,
  CATALOG_DRIFT: 400,
};

router.post('/:id/submit', requireRole('admin', 'pharmacist'), auditMiddleware('pharmacy_purchase_order'), async (req, res, next) => {
  try {
    const result = await submitPurchaseOrder(req.user.tenantId, req.params.id, req.user.sub);
    res.json(result);
  } catch (e: any) {
    const code = e.message?.split(':')[0];
    if (code && SUBMIT_ERROR_STATUS[code]) {
      res.status(SUBMIT_ERROR_STATUS[code]).json({
        error: e.message.split(':').slice(1).join(':') || e.message,
        code,
      });
      return;
    }
    next(e);
  }
});

router.post('/:id/cancel', requireRole('admin', 'pharmacist'), auditMiddleware('pharmacy_purchase_order'), async (req, res, next) => {
  try {
    const result = await cancelPurchaseOrder(req.user.tenantId, req.params.id);
    res.json(result);
  } catch (e: any) {
    if (e.message?.startsWith('PO_NOT_CANCELLABLE')) {
      res.status(400).json({ error: e.message.split(':').slice(1).join(':'), code: 'PO_NOT_CANCELLABLE' });
      return;
    }
    next(e);
  }
});

router.post('/:id/confirm-receipt', requireRole('admin', 'pharmacist'), auditMiddleware('pharmacy_purchase_order'), async (req, res, next) => {
  try {
    const result = await confirmPurchaseOrderReceipt(req.user.tenantId, req.params.id);
    res.json(result);
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin', 'pharmacist'), auditMiddleware('pharmacy_purchase_order'), async (req, res, next) => {
  try {
    const result = await deletePurchaseOrder(req.user.tenantId, req.params.id);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
