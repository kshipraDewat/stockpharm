import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { createOrder, finalizeOrder, listOrders, cancelOrder, deliverOrder, shipOrder, approvePharmacyOrder, rejectPharmacyOrder, cancelApprovedPharmacyOrder, OrderHasBillError, getPharmacyExposure } from '../services/orderService.js';
import { generateBill } from '../services/billService.js';
import { createReturn } from '../services/returnService.js';
import { getDb } from '../db/client.js';
import { orders, orderItems, products, productBatches, pharmacies, returnItems, returns, bills, stockistConnections } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { parseOrderText } from '../services/aiOrderParseService.js';
import { env } from '../env.js';

const router = Router();
router.use(authenticate, requireTenantType('stockist'));

// AI order-text parsing — pasted WhatsApp/free-text order → catalogue-matched items.
// Static path declared before /:id handlers. Gated by FEATURE_AI_PARSE + GEMINI_API_KEY.
router.post('/parse-text', requireRole('admin', 'biller'), async (req, res, next) => {
  try {
    if (!env.FEATURE_AI_PARSE) {
      res.status(403).json({ error: 'AI features not enabled. Set FEATURE_AI_PARSE=true and GEMINI_API_KEY in .env' });
      return;
    }
    const { text } = z.object({ text: z.string().min(1) }).parse(req.body);
    const result = await parseOrderText(req.user.tenantId, text);
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const { search, status, pharmacyId, source, dateFrom, dateTo, page, pageSize } = req.query as Record<string, string>;
    const result = await listOrders(req.user.tenantId, { search, status, pharmacyId, source, dateFrom, dateTo, page: parseInt(page ?? '1'), pageSize: parseInt(pageSize ?? '20') });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const order = await db.query.orders.findFirst({
      where: and(eq(orders.id, req.params.id), eq(orders.tenantId, req.user.tenantId)),
    });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

    const items = await db.select({
      id: orderItems.id, productId: orderItems.productId, qty: orderItems.qty,
      freeQty: orderItems.freeQty, rate: orderItems.rate, gstRate: orderItems.gstRate,
      lineSubtotal: orderItems.lineSubtotal, lineTax: orderItems.lineTax, lineTotal: orderItems.lineTotal,
      productName: products.name, hsnCode: products.hsnCode,
      batchNumber: productBatches.batchNumber, expiryDate: productBatches.expiryDate,
      batchId: orderItems.batchId,
      stockOnHand: sql<number>`COALESCE((
        SELECT SUM(qty_on_hand) FROM product_batches
        WHERE product_id = ${orderItems.productId} AND tenant_id = ${req.user.tenantId}
      ), 0)`.as('stockOnHand'),
      returnedQty: sql<number>`COALESCE((
        SELECT SUM(${returnItems.qty})
        FROM ${returnItems}
        INNER JOIN ${returns} ON ${returnItems.returnId} = ${returns.id}
        WHERE ${returnItems.orderItemId} = ${orderItems.id}
          AND ${returns.tenantId} = ${req.user.tenantId}
      ), 0)`.as('returnedQty'),
    }).from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .leftJoin(productBatches, eq(orderItems.batchId, productBatches.id))
      .where(eq(orderItems.orderId, req.params.id));

    const pharmacy = await db.query.pharmacies.findFirst({ where: eq(pharmacies.id, order.pharmacyId) });
    const bill = await db.query.bills.findFirst({
      where: and(eq(bills.orderId, req.params.id), eq(bills.tenantId, req.user.tenantId)),
    });

    let creditInfo: { creditLimit: number; creditUsed: number; creditAvailable: number } | null = null;
    if (order.stockistConnectionId) {
      const conn = await db.query.stockistConnections.findFirst({
        where: eq(stockistConnections.id, order.stockistConnectionId),
      });
      const creditLimit = conn?.creditLimit ? parseFloat(conn.creditLimit) : (pharmacy?.creditLimit ? parseFloat(pharmacy.creditLimit) : 0);
      const creditUsed = await getPharmacyExposure(db, req.user.tenantId, order.pharmacyId, order.id);
      creditInfo = {
        creditLimit,
        creditUsed,
        creditAvailable: Math.max(0, creditLimit - creditUsed),
      };
    } else if (pharmacy) {
      const creditLimit = pharmacy.creditLimit ? parseFloat(pharmacy.creditLimit) : 0;
      const creditUsed = await getPharmacyExposure(db, req.user.tenantId, order.pharmacyId, order.id);
      creditInfo = { creditLimit, creditUsed, creditAvailable: Math.max(0, creditLimit - creditUsed) };
    }

    res.json({
      ...order,
      pharmacyName: pharmacy?.name,
      totalAmount: parseFloat(order.total),
      items: items.map(i => ({ ...i, stockOnHand: Number(i.stockOnHand ?? 0) })),
      pharmacy,
      creditInfo,
      hasBill: !!bill,
    });
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), auditMiddleware('order'), async (req, res, next) => {
  try {
    const body = z.object({
      pharmacyId: z.string().uuid(),
      orderDate: z.string(),
      paymentMode: z.enum(['credit', 'cash']).default('credit'),
      notes: z.string().optional(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        qty: z.number().int().positive(),
        freeQty: z.number().int().default(0),
      })).min(1),
    }).parse(req.body);
    const result = await createOrder(req.user.tenantId, req.user.sub, body);
    res.status(201).json(result);
  } catch (e: any) {
    if (e.message?.includes('CREDIT_LIMIT_EXCEEDED') || e.message?.includes('PHARMACY_INACTIVE')) {
      res.status(400).json({ error: e.message.split(':').slice(1).join(':') || e.message, code: e.message.split(':')[0] });
      return;
    }
    next(e);
  }
});

router.post('/:id/finalize', requireRole('admin'), auditMiddleware('order'), async (req, res, next) => {
  try {
    const result = await finalizeOrder(req.user.tenantId, req.params.id, req.user.sub);
    res.json(result);
  } catch (e: any) {
    if (e.message?.includes('not found')) { res.status(404).json({ error: e.message }); return; }
    if (e.message?.includes('CREDIT_LIMIT_EXCEEDED') || e.message?.includes('PHARMACY_INACTIVE')) {
      res.status(400).json({ error: e.message.split(':').slice(1).join(':') || e.message, code: e.message.split(':')[0] });
      return;
    }
    next(e);
  }
});

router.post('/:id/deliver', requireRole('admin'), auditMiddleware('order'), async (req, res, next) => {
  try {
    const result = await deliverOrder(req.user.tenantId, req.params.id);
    res.json(result);
  } catch (e: any) {
    if (e.message?.includes('not found')) { res.status(404).json({ error: e.message }); return; }
    if (e.message?.includes('Cannot deliver')) { res.status(400).json({ error: e.message }); return; }
    if (e.message?.includes('BILL_REQUIRED')) { res.status(400).json({ error: e.message.split(':')[1] ?? e.message, code: 'BILL_REQUIRED' }); return; }
    next(e);
  }
});

router.post('/:id/ship', requireRole('admin'), auditMiddleware('order'), async (req, res, next) => {
  try {
    const body = z.object({
      carrier: z.string().optional(),
      awb: z.string().optional(),
      shippedAt: z.string().optional(),
    }).parse(req.body ?? {});
    const result = await shipOrder(req.user.tenantId, req.params.id, body);
    res.json(result);
  } catch (e: any) {
    if (e.message?.includes('not found')) { res.status(404).json({ error: e.message }); return; }
    if (e.message?.includes('must be packed')) { res.status(400).json({ error: e.message }); return; }
    next(e);
  }
});

router.post('/:id/approve', requireRole('admin'), auditMiddleware('order'), async (req, res, next) => {
  try {
    const { finalizeNow } = z.object({ finalizeNow: z.boolean().optional() }).parse(req.body ?? {});
    const result = await approvePharmacyOrder(req.user.tenantId, req.params.id, req.user.sub, finalizeNow ?? false);
    res.json(result);
  } catch (e: any) {
    if (e.message?.includes('not found')) { res.status(404).json({ error: e.message }); return; }
    if (e.message?.includes('Not a pharmacy') || e.message?.includes('not pending') || e.message?.includes('already been approved')) {
      res.status(400).json({ error: e.message }); return;
    }
    if (e.message?.includes('CREDIT_LIMIT_EXCEEDED') || e.message?.includes('PHARMACY_INACTIVE')) {
      res.status(400).json({ error: e.message.split(':').slice(1).join(':') || e.message, code: e.message.split(':')[0] });
      return;
    }
    next(e);
  }
});

router.post('/:id/reject', requireRole('admin'), auditMiddleware('order'), async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body);
    const result = await rejectPharmacyOrder(req.user.tenantId, req.params.id, reason);
    res.json(result);
  } catch (e: any) {
    if (e.message?.includes('not found')) { res.status(404).json({ error: e.message }); return; }
    if (e.message?.includes('Not a pharmacy') || e.message?.includes('not pending')) {
      res.status(400).json({ error: e.message }); return;
    }
    next(e);
  }
});

router.post('/:id/cancel-approved', requireRole('admin'), auditMiddleware('order'), async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body);
    const result = await cancelApprovedPharmacyOrder(req.user.tenantId, req.params.id, reason);
    res.json(result);
  } catch (e: any) {
    if (e.message?.includes('not found')) { res.status(404).json({ error: e.message }); return; }
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/cancel', requireRole('admin'), auditMiddleware('order'), async (req, res, next) => {
  try {
    const result = await cancelOrder(req.user.tenantId, req.params.id, req.user.sub);
    res.json(result);
  } catch (e: any) {
    if (e instanceof OrderHasBillError) { res.status(400).json({ error: e.message, code: e.code }); return; }
    if (e.message === 'Order not found') { res.status(404).json({ error: e.message }); return; }
    if (e.message?.includes('Cannot cancel')) { res.status(400).json({ error: e.message }); return; }
    next(e);
  }
});

router.post('/:id/bill', requireRole('admin', 'biller'), auditMiddleware('bill'), async (req, res, next) => {
  try {
    const bill = await generateBill(req.user.tenantId, req.params.id, req.user.sub);
    res.status(201).json(bill);
  } catch (e) { next(e); }
});

router.post('/:id/return', requireRole('admin'), auditMiddleware('return'), async (req, res, next) => {
  try {
    const body = z.object({
      returnDate: z.string(),
      reason: z.enum(['expired', 'damaged', 'wrong_item', 'cancelled', 'other']).default('other'),
      notes: z.string().optional(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        batchId: z.string().uuid().optional(),
        orderItemId: z.string().uuid().optional(),
        qty: z.number().int().positive(),
        rate: z.number().positive(),
        gstRate: z.number(),
      })).min(1),
    }).parse(req.body);

    const db = await getDb();
    const order = await db.query.orders.findFirst({ where: and(eq(orders.id, req.params.id), eq(orders.tenantId, req.user.tenantId)) });
    if (!order) { res.status(404).json({ error: 'Order not found' }); return; }
    if (order.status !== 'delivered') {
      res.status(400).json({ error: 'Returns can only be initiated for delivered orders' });
      return;
    }

    const ret = await createReturn(req.user.tenantId, req.user.sub, { ...body, pharmacyId: order.pharmacyId, orderId: req.params.id });
    res.status(201).json(ret);
  } catch (e) { next(e); }
});

export default router;
