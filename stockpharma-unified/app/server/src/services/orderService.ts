import { getDb, type DbClient } from '../db/client.js';
import { orders, orderItems, pharmacies, products, productBatches, bills, stockistConnections } from '../db/schema.js';
import { eq, and, desc, like, ilike, or, sql, count, isNull, isNotNull, ne, gte, lte, inArray } from 'drizzle-orm';
import { computeGst, round2 } from '../lib/gst.js';
import { reserveStock, releaseStock, InsufficientStockError } from '../lib/inventory.js';
import { postEntry } from '../lib/ledger.js';
import { nextOrderNumber } from '../lib/ids.js';
import { LEDGER_ACCOUNT_CODES } from '../../../shared/constants.js';
import { emitCrossTenantEvent } from '../lib/crossTenant.js';
import { generateBill } from './billService.js';

async function getPharmacyBillsOutstanding(db: Awaited<ReturnType<typeof getDb>>, tenantId: string, pharmacyId: string): Promise<number> {
  const rows = await db.select({
    total: bills.total,
    paidAmount: bills.paidAmount,
  }).from(bills).where(and(
    eq(bills.tenantId, tenantId),
    eq(bills.pharmacyId, pharmacyId),
  ));
  return rows.reduce((s, r) => {
    const due = Math.max(0, parseFloat(r.total) - parseFloat(r.paidAmount));
    return s + due;
  }, 0);
}

/**
 * M30: total exposure to a pharmacy = unpaid bills + packed orders awaiting bill
 * + shipped orders awaiting delivery. This is what the approval check + credit
 * widget should compare against the credit limit.
 */
export async function getPharmacyExposure(
  db: Awaited<ReturnType<typeof getDb>>,
  tenantId: string,
  pharmacyId: string,
  excludeOrderId?: string,
): Promise<number> {
  const outstanding = await getPharmacyBillsOutstanding(db, tenantId, pharmacyId);
  // Sum totals of in-flight orders that don't yet have a bill (the bill is only
  // generated when the order is packed/shipped); but skip orders that already
  // have a linked bill in `bills` (avoid double-counting).
  const inFlight = await db.select({ id: orders.id, total: orders.total })
    .from(orders)
    .where(and(
      eq(orders.tenantId, tenantId),
      eq(orders.pharmacyId, pharmacyId),
      inArray(orders.status, ['pending', 'packed', 'shipped']),
      isNotNull(orders.approvedAt),
      excludeOrderId ? ne(orders.id, excludeOrderId) : sql`true`,
    ));
  let inFlightTotal = 0;
  for (const o of inFlight) {
    const linkedBill = await db.query.bills.findFirst({ where: eq(bills.orderId, o.id) });
    if (!linkedBill) inFlightTotal += parseFloat(o.total);
  }
  return outstanding + inFlightTotal;
}

function isDuplicateKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /unique|duplicate/i.test(msg);
}

export async function createOrder(tenantId: string, userId: string, body: {
  pharmacyId: string;
  orderDate: string;
  paymentMode: 'credit' | 'cash';
  notes?: string;
  items: { productId: string; qty: number; freeQty?: number }[];
}) {
  const db = await getDb();
  const pharmacy = await db.query.pharmacies.findFirst({ where: and(eq(pharmacies.id, body.pharmacyId), eq(pharmacies.tenantId, tenantId)) });
  if (!pharmacy) throw new Error('Pharmacy not found');

  const tenant = await db.query.tenants.findFirst({ where: eq((await import('../db/schema.js')).tenants.id, tenantId) });
  const sellerState = tenant?.stateCode ?? '08';
  const buyerState = pharmacy.stateCode;
  const isInterstate = sellerState !== buyerState;

  const orderNumber = await nextOrderNumber(tenantId);
  let order;
  for (let attempt = 0; attempt < 3; attempt++) {
    const num = attempt === 0 ? orderNumber : await nextOrderNumber(tenantId);
    try {
      [order] = await db.insert(orders).values({
        tenantId, pharmacyId: body.pharmacyId, orderNumber: num, orderDate: body.orderDate,
        status: 'pending', paymentMode: body.paymentMode, notes: body.notes,
        isInterstate, placeOfSupply: buyerState, createdBy: userId,
        subtotal: '0', taxAmount: '0', total: '0',
      }).returning();
      break;
    } catch (err) {
      if (attempt < 2 && isDuplicateKeyError(err)) continue;
      throw err;
    }
  }
  if (!order) throw new Error('Failed to create order');

  let totalSubtotal = 0, totalTax = 0;
  for (const item of body.items) {
    const product = await db.query.products.findFirst({ where: and(eq(products.id, item.productId), eq(products.tenantId, tenantId)) });
    if (!product) throw new Error(`Product ${item.productId} not found`);

    const batches = await db.select().from(productBatches)
      .where(and(eq(productBatches.productId, item.productId), eq(productBatches.tenantId, tenantId)));
    const availableBatch = batches.find(b => b.qtyOnHand >= item.qty);
    const batch = availableBatch ?? batches[0];

    const rate = parseFloat(product.saleRate);
    const gstRate = parseFloat(product.gstRate);
    const lineSubtotal = round2(rate * item.qty);
    const gst = computeGst([{ gstRate, lineSubtotal }], sellerState, buyerState);
    const lineTax = gst.totalTax;
    const lineTotal = round2(lineSubtotal + lineTax);

    await db.insert(orderItems).values({
      orderId: order.id, tenantId, productId: item.productId,
      batchId: batch?.id ?? null, qty: item.qty, freeQty: item.freeQty ?? 0,
      rate: rate.toString(), gstRate: gstRate.toString(),
      lineSubtotal: lineSubtotal.toString(), lineTax: lineTax.toString(), lineTotal: lineTotal.toString(),
    });

    totalSubtotal += lineSubtotal;
    totalTax += lineTax;
  }

  const total = round2(totalSubtotal + totalTax);
  await db.update(orders).set({
    subtotal: totalSubtotal.toString(), taxAmount: totalTax.toString(), total: total.toString(),
  }).where(eq(orders.id, order.id));

  if (body.paymentMode === 'credit') {
    if (pharmacy.status !== 'active') {
      throw new Error('PHARMACY_INACTIVE:Pharmacy account is inactive or blocked');
    }
    const creditLimit = pharmacy.creditLimit ? parseFloat(pharmacy.creditLimit) : 0;
    const exposure = await getPharmacyExposure(db, tenantId, body.pharmacyId);
    if (creditLimit > 0 && exposure + total > creditLimit) {
      throw new Error('CREDIT_LIMIT_EXCEEDED:Order total would exceed pharmacy credit limit');
    }
  }

  return { ...order, subtotal: totalSubtotal, taxAmount: totalTax, total };
}

async function loadOrderWithItems(tx: DbClient, tenantId: string, orderId: string) {
  const [order] = await tx.select().from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);
  if (!order) return null;
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return { ...order, orderItems: items };
}

async function finalizeOrderCore(
  tenantId: string, orderId: string, userId: string, tx: DbClient,
  billOpts?: { billDate?: string; dueDate?: string },
) {
  const order = await loadOrderWithItems(tx, tenantId, orderId);
  if (!order) throw new Error('Order not found');
  if (order.status !== 'pending') throw new Error('Order already finalized');
  if (order.source === 'pharmacy_submitted' && !order.approvedAt) {
    throw new Error('Order requires approval before packing');
  }

  if (order.paymentMode === 'credit') {
    const pharmacy = await tx.query.pharmacies.findFirst({ where: eq(pharmacies.id, order.pharmacyId) });
    if (pharmacy && pharmacy.status !== 'active') {
      throw new Error('PHARMACY_INACTIVE:Pharmacy account is inactive or blocked');
    }
    const creditLimit = pharmacy?.creditLimit ? parseFloat(pharmacy.creditLimit) : 0;
    const exposure = pharmacy ? await getPharmacyExposure(tx as any, tenantId, order.pharmacyId, orderId) : 0;
    const orderTotal = parseFloat(order.total);
    if (creditLimit > 0 && exposure + orderTotal > creditLimit) {
      throw new Error('CREDIT_LIMIT_EXCEEDED:Finalizing would exceed pharmacy credit limit');
    }
  }

  const reserved: { batchId: string; qty: number }[] = [];

  try {
    for (const item of order.orderItems) {
      const consumed = await reserveStock(tenantId, item.productId, item.qty, tx, {
        refType: 'order',
        refId: orderId,
        refNumber: order.orderNumber,
        performedBy: userId,
        asOfDate: order.orderDate,
      });
      if (consumed[0]) {
        await tx.update(orderItems).set({ batchId: consumed[0].batchId }).where(eq(orderItems.id, item.id));
      }
      for (const c of consumed) {
        reserved.push({ batchId: c.batchId, qty: c.qty });
      }
    }
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      for (const r of reserved) {
        await releaseStock(tenantId, r.batchId, r.qty, tx, {
          refType: 'order',
          refId: orderId,
          refNumber: order.orderNumber,
          reason: 'sale_void',
          performedBy: userId,
        });
      }
    }
    throw err;
  }

  await tx.update(orders).set({ status: 'packed' }).where(eq(orders.id, orderId));

  if (order.source === 'pharmacy_submitted' && order.stockistConnectionId) {
    const conn = await tx.query.stockistConnections.findFirst({
      where: eq(stockistConnections.id, order.stockistConnectionId),
    });
    if (conn) {
      await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'order.packed', {
        orderId: order.id,
        externalPharmacyOrderId: order.externalPharmacyOrderId,
      }, tx as DbClient);
    }
  }

  if (order.paymentMode === 'credit') {
    await tx.update(pharmacies).set({
      outstanding: sql`outstanding + ${order.total}`,
    }).where(eq(pharmacies.id, order.pharmacyId));
  }

  const pharmacy = await tx.query.pharmacies.findFirst({ where: eq(pharmacies.id, order.pharmacyId) });
  const total = parseFloat(order.total);
  const subtotal = parseFloat(order.subtotal);
  const taxAmount = parseFloat(order.taxAmount);
  const isInterstate = order.isInterstate;

  if (order.paymentMode === 'credit') {
    await postEntry({
      tenantId, txnDate: order.orderDate, refType: 'order', refId: order.id,
      narration: `Credit sale to ${pharmacy?.name} | ${order.orderNumber}`,
      createdBy: userId,
      lines: [
        { accountCode: LEDGER_ACCOUNT_CODES.SUNDRY_DEBTORS, partnerType: 'pharmacy', partnerId: order.pharmacyId, debit: total },
        { accountCode: LEDGER_ACCOUNT_CODES.SALES, credit: subtotal },
        ...(isInterstate
          ? [{ accountCode: LEDGER_ACCOUNT_CODES.IGST_OUTPUT, credit: taxAmount }]
          : [
              { accountCode: LEDGER_ACCOUNT_CODES.CGST_OUTPUT, credit: round2(taxAmount / 2) },
              { accountCode: LEDGER_ACCOUNT_CODES.SGST_OUTPUT, credit: round2(taxAmount / 2) },
            ]
        ),
      ],
    }, tx as DbClient);
  } else {
    await postEntry({
      tenantId, txnDate: order.orderDate, refType: 'order', refId: order.id,
      narration: `Cash sale to ${pharmacy?.name} | ${order.orderNumber}`,
      createdBy: userId,
      lines: [
        { accountCode: LEDGER_ACCOUNT_CODES.CASH, debit: total },
        { accountCode: LEDGER_ACCOUNT_CODES.SALES, credit: subtotal },
        ...(isInterstate
          ? [{ accountCode: LEDGER_ACCOUNT_CODES.IGST_OUTPUT, credit: taxAmount }]
          : [
              { accountCode: LEDGER_ACCOUNT_CODES.CGST_OUTPUT, credit: round2(taxAmount / 2) },
              { accountCode: LEDGER_ACCOUNT_CODES.SGST_OUTPUT, credit: round2(taxAmount / 2) },
            ]
        ),
      ],
    }, tx as DbClient);
  }

  if (order.source === 'pharmacy_submitted' || order.paymentMode === 'credit') {
    await generateBill(tenantId, orderId, userId, tx as DbClient, billOpts);
  }
  return await tx.query.orders.findFirst({ where: eq(orders.id, orderId) });
}

export async function finalizeOrder(
  tenantId: string, orderId: string, userId: string, dbClient?: DbClient,
  billOpts?: { billDate?: string; dueDate?: string },
) {
  if (!dbClient) {
    const outer = await getDb();
    return outer.transaction((tx) => finalizeOrderCore(tenantId, orderId, userId, tx as DbClient, billOpts));
  }
  return finalizeOrderCore(tenantId, orderId, userId, dbClient, billOpts);
}

export class OrderHasBillError extends Error {
  code = 'ORDER_HAS_BILL';
  constructor() {
    super('Cannot cancel order with an active bill');
    this.name = 'OrderHasBillError';
  }
}

export async function cancelOrder(tenantId: string, orderId: string, userId: string, opts?: { txnDate?: string }) {
  const db = await getDb();
  const order = await loadOrderWithItems(db, tenantId, orderId);
  if (!order) throw new Error('Order not found');
  if (!['pending', 'packed'].includes(order.status)) throw new Error('Cannot cancel order in current status');

  const bill = await db.query.bills.findFirst({
    where: and(eq(bills.orderId, orderId), eq(bills.tenantId, tenantId)),
  });
  if (bill) throw new OrderHasBillError();

  if (order.status === 'packed') {
    await db.transaction(async (tx) => {
      for (const item of order.orderItems) {
        if (item.batchId) await releaseStock(tenantId, item.batchId, item.qty, tx as any, {
          refType: 'order',
          refId: orderId,
          refNumber: order.orderNumber,
          reason: 'sale_void',
          productId: item.productId,
          performedBy: userId,
        });
      }

      if (order.paymentMode === 'credit') {
        await tx.update(pharmacies).set({
          outstanding: sql`GREATEST(0, outstanding - ${order.total})`,
        }).where(eq(pharmacies.id, order.pharmacyId));
      }

      const pharmacy = await tx.query.pharmacies.findFirst({ where: eq(pharmacies.id, order.pharmacyId) });
      const total = parseFloat(order.total);
      const subtotal = parseFloat(order.subtotal);
      const taxAmount = parseFloat(order.taxAmount);
      const isInterstate = order.isInterstate;
      const txnDate = opts?.txnDate ?? new Date().toISOString().split('T')[0];

      if (order.paymentMode === 'credit') {
        await postEntry({
          tenantId, txnDate, refType: 'order', refId: order.id,
          narration: `Order cancellation ${order.orderNumber} | ${pharmacy?.name}`,
          createdBy: userId,
          lines: [
            { accountCode: LEDGER_ACCOUNT_CODES.SALES, debit: subtotal },
            ...(isInterstate
              ? [{ accountCode: LEDGER_ACCOUNT_CODES.IGST_OUTPUT, debit: taxAmount }]
              : [
                  { accountCode: LEDGER_ACCOUNT_CODES.CGST_OUTPUT, debit: round2(taxAmount / 2) },
                  { accountCode: LEDGER_ACCOUNT_CODES.SGST_OUTPUT, debit: round2(taxAmount / 2) },
                ]
            ),
            { accountCode: LEDGER_ACCOUNT_CODES.SUNDRY_DEBTORS, partnerType: 'pharmacy', partnerId: order.pharmacyId, credit: total },
          ],
        }, tx as any);
      } else {
        await postEntry({
          tenantId, txnDate, refType: 'order', refId: order.id,
          narration: `Order cancellation ${order.orderNumber} | ${pharmacy?.name}`,
          createdBy: userId,
          lines: [
            { accountCode: LEDGER_ACCOUNT_CODES.SALES, debit: subtotal },
            ...(isInterstate
              ? [{ accountCode: LEDGER_ACCOUNT_CODES.IGST_OUTPUT, debit: taxAmount }]
              : [
                  { accountCode: LEDGER_ACCOUNT_CODES.CGST_OUTPUT, debit: round2(taxAmount / 2) },
                  { accountCode: LEDGER_ACCOUNT_CODES.SGST_OUTPUT, debit: round2(taxAmount / 2) },
                ]
            ),
            { accountCode: LEDGER_ACCOUNT_CODES.CASH, credit: total },
          ],
        }, tx as any);
      }

      await tx.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, orderId));
    });
  } else {
    await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, orderId));
  }

  const row = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });

  if (order.source === 'pharmacy_submitted' && order.stockistConnectionId) {
    const conn = await db.query.stockistConnections.findFirst({
      where: eq(stockistConnections.id, order.stockistConnectionId),
    });
    if (conn) {
      await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'order.cancelled', {
        orderId: order.id,
        externalPharmacyOrderId: order.externalPharmacyOrderId,
      });
    }
  }

  return row;
}

export async function deliverOrder(tenantId: string, orderId: string) {
  const db = await getDb();
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
  });
  if (!order) throw new Error('Order not found');
  if (!['packed', 'shipped'].includes(order.status)) {
    throw new Error(`Cannot deliver order in status '${order.status}'. Order must be packed or shipped first.`);
  }
  if (order.source === 'pharmacy_submitted') {
    const bill = await db.query.bills.findFirst({
      where: and(eq(bills.orderId, orderId), eq(bills.tenantId, tenantId)),
    });
    if (!bill) throw new Error('BILL_REQUIRED:Generate a bill before recording delivery for portal orders');
  }
  const [row] = await db.update(orders).set({ status: 'delivered' })
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId))).returning();

  if (order.source === 'pharmacy_submitted' && order.stockistConnectionId) {
    const conn = await db.query.stockistConnections.findFirst({
      where: eq(stockistConnections.id, order.stockistConnectionId),
    });
    if (conn) {
      await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'order.delivered', {
        orderId: order.id,
        externalPharmacyOrderId: order.externalPharmacyOrderId,
      });
    }
  }

  return row;
}

export async function shipOrder(tenantId: string, orderId: string, body: {
  carrier?: string; awb?: string; shippedAt?: string;
}) {
  const db = await getDb();
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
  });
  if (!order) throw new Error('Order not found');
  if (order.status !== 'packed') throw new Error('Order must be packed before shipping');

  const shippedAt = body.shippedAt ? new Date(body.shippedAt) : new Date();
  return db.transaction(async (tx) => {
    const updated = await tx.update(orders).set({
      status: 'shipped',
      trackingCarrier: body.carrier ?? null,
      trackingAwb: body.awb ?? null,
      shippedAt,
    }).where(and(eq(orders.id, orderId), eq(orders.status, 'packed'))).returning();
    if (updated.length === 0) throw new Error('Order is no longer in packed state');
    const row = updated[0];

    if (order.source === 'pharmacy_submitted' || order.paymentMode === 'credit') {
      await generateBill(tenantId, orderId, null, tx as any);
      if (order.stockistConnectionId) {
        const conn = await tx.query.stockistConnections.findFirst({
          where: eq(stockistConnections.id, order.stockistConnectionId),
        });
        if (conn) {
          await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'order.shipped', {
            orderId: order.id,
            externalPharmacyOrderId: order.externalPharmacyOrderId,
            carrier: body.carrier,
            awb: body.awb,
            shippedAt: shippedAt.toISOString(),
          }, tx as any);
        }
      }
    }

    return row;
  });
}

export async function approvePharmacyOrder(
  tenantId: string, orderId: string, userId: string, finalizeNow = false,
  opts?: { approvedAt?: Date; billDate?: string; dueDate?: string },
) {
  const db = await getDb();
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
  });
  if (!order) throw new Error('Order not found');
  if (order.source !== 'pharmacy_submitted') throw new Error('Not a pharmacy-submitted order');
  if (order.status !== 'pending') throw new Error('Order is not pending approval');
  if (order.approvedAt) throw new Error('Order has already been approved');

  const pharmacy = await db.query.pharmacies.findFirst({ where: eq(pharmacies.id, order.pharmacyId) });
  if (pharmacy && pharmacy.status !== 'active') {
    throw new Error('PHARMACY_INACTIVE:Pharmacy account is inactive or blocked');
  }

  if (order.paymentMode === 'credit') {
    const conn = order.stockistConnectionId
      ? await db.query.stockistConnections.findFirst({ where: eq(stockistConnections.id, order.stockistConnectionId) })
      : null;
    const creditLimit = conn?.creditLimit != null
      ? parseFloat(conn.creditLimit)
      : (pharmacy?.creditLimit ? parseFloat(pharmacy.creditLimit) : 0);
    // M30: include packed/shipped-but-unbilled exposure in the credit check.
    const exposure = pharmacy ? await getPharmacyExposure(db, tenantId, order.pharmacyId, orderId) : 0;
    const orderTotal = parseFloat(order.total);
    if (creditLimit > 0 && exposure + orderTotal > creditLimit) {
      throw new Error('CREDIT_LIMIT_EXCEEDED:Approval would exceed pharmacy credit limit');
    }
  }

  const approvedAt = opts?.approvedAt ?? new Date();
  if (finalizeNow) {
    return db.transaction(async (tx) => {
      await tx.update(orders).set({ approvedAt, approvedBy: userId }).where(eq(orders.id, orderId));
      if (order.stockistConnectionId) {
        const conn = await tx.query.stockistConnections.findFirst({
          where: eq(stockistConnections.id, order.stockistConnectionId),
        });
        if (conn) {
          await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'order.accepted', {
            orderId: order.id,
            externalPharmacyOrderId: order.externalPharmacyOrderId,
          }, tx as DbClient);
        }
      }
      return finalizeOrderCore(tenantId, orderId, userId, tx as DbClient, {
        billDate: opts?.billDate,
        dueDate: opts?.dueDate,
      });
    });
  }

  return db.transaction(async (tx) => {
    await tx.update(orders).set({
      approvedAt,
      approvedBy: userId,
    }).where(eq(orders.id, orderId));

    if (order.stockistConnectionId) {
      const conn = await tx.query.stockistConnections.findFirst({
        where: eq(stockistConnections.id, order.stockistConnectionId),
      });
      if (conn) {
        await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'order.accepted', {
          orderId: order.id,
          externalPharmacyOrderId: order.externalPharmacyOrderId,
        }, tx as DbClient);
      }
    }

    return tx.query.orders.findFirst({ where: eq(orders.id, orderId) });
  });
}

export async function rejectPharmacyOrder(tenantId: string, orderId: string, reason: string) {
  const db = await getDb();
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
  });
  if (!order) throw new Error('Order not found');
  if (order.source !== 'pharmacy_submitted') throw new Error('Not a pharmacy-submitted order');
  if (order.status !== 'pending') throw new Error('Order is not pending');
  if (order.approvedAt) throw new Error('Order has been approved — use cancel approved order instead');

  const [row] = await db.update(orders).set({
    status: 'cancelled',
    rejectionReason: reason,
  }).where(eq(orders.id, orderId)).returning();

  if (order.stockistConnectionId) {
    const conn = await db.query.stockistConnections.findFirst({
      where: eq(stockistConnections.id, order.stockistConnectionId),
    });
    if (conn) {
      await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'order.rejected', {
        orderId: order.id,
        externalPharmacyOrderId: order.externalPharmacyOrderId,
        reason,
      });
    }
  }

  return row;
}

export async function cancelApprovedPharmacyOrder(tenantId: string, orderId: string, reason: string) {
  const db = await getDb();
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
  });
  if (!order) throw new Error('Order not found');
  if (order.source !== 'pharmacy_submitted') throw new Error('Not a pharmacy-submitted order');
  if (order.status !== 'pending' || !order.approvedAt) {
    throw new Error('Order is not in approved-but-not-packed state');
  }

  const [row] = await db.update(orders).set({
    status: 'cancelled',
    approvedAt: null,
    approvedBy: null,
    rejectionReason: reason,
  }).where(eq(orders.id, orderId)).returning();

  if (order.stockistConnectionId) {
    const conn = await db.query.stockistConnections.findFirst({
      where: eq(stockistConnections.id, order.stockistConnectionId),
    });
    if (conn) {
      await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'order.cancelled', {
        orderId: order.id,
        externalPharmacyOrderId: order.externalPharmacyOrderId,
        reason,
      });
    }
  }

  return row;
}

export async function listOrders(tenantId: string, params: {
  search?: string; status?: string; pharmacyId?: string; source?: string;
  dateFrom?: string; dateTo?: string;
  page?: number; pageSize?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;

  const searchPattern = params.search ? `%${params.search}%` : undefined;
  // me1: synthetic `approved` filter == status='pending' AND approvedAt IS NOT NULL.
  // Keeps the existing semantics for `pending` (still excludes approved-but-not-packed)
  // and adds a way to surface approved-but-not-yet-packed portal orders.
  const isApprovedFilter = params.status === 'approved';
  const excludeApproved = params.source === 'pharmacy_submitted' && params.status === 'pending';
  const baseWhere = and(
    eq(orders.tenantId, tenantId),
    isApprovedFilter
      ? and(eq(orders.status, 'pending'), isNotNull(orders.approvedAt))
      : params.status ? eq(orders.status, params.status as any) : undefined,
    excludeApproved ? isNull(orders.approvedAt) : undefined,
    params.pharmacyId ? eq(orders.pharmacyId, params.pharmacyId) : undefined,
    params.source ? eq(orders.source, params.source as any) : undefined,
    params.dateFrom ? gte(orders.orderDate, params.dateFrom) : undefined,
    params.dateTo ? lte(orders.orderDate, params.dateTo) : undefined,
    searchPattern
      ? or(ilike(orders.orderNumber, searchPattern), ilike(pharmacies.name, searchPattern))
      : undefined,
  );

  const rows = await db
    .select({
      id: orders.id, orderNumber: orders.orderNumber, orderDate: orders.orderDate,
      status: orders.status, source: orders.source, paymentMode: orders.paymentMode, total: orders.total,
      pharmacyId: orders.pharmacyId, pharmacyName: pharmacies.name,
      subtotal: orders.subtotal, taxAmount: orders.taxAmount, createdAt: orders.createdAt,
      approvedAt: orders.approvedAt,
    })
    .from(orders)
    .leftJoin(pharmacies, eq(orders.pharmacyId, pharmacies.id))
    .where(baseWhere)
    .orderBy(desc(orders.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total: totalCount }] = await db
    .select({ total: count() })
    .from(orders)
    .leftJoin(pharmacies, eq(orders.pharmacyId, pharmacies.id))
    .where(baseWhere);

  return { data: rows, total: Number(totalCount), page, pageSize, pages: Math.ceil(Number(totalCount) / pageSize) };
}
