import { getDb, type DbClient } from '../db/client.js';
import {
  pharmacyPurchaseOrders, pharmacyPurchaseOrderItems, stockistConnections,
  orders, orderItems, tenants, payableBills, payableBillItems, pharmacies, productBatches,
} from '../db/schema.js';
import { eq, and, desc, count, ilike, or, inArray, sql } from 'drizzle-orm';
import { round2 } from '../lib/gst.js';
import { nextPharmacyPoNumber, nextOrderNumber } from '../lib/ids.js';
import { emitCrossTenantEvent } from '../lib/crossTenant.js';
import { approvePharmacyOrder, rejectPharmacyOrder } from './orderService.js';

function parseTenantSettings(notificationsJson: string | null | undefined): Record<string, unknown> {
  if (!notificationsJson) return {};
  try { return JSON.parse(notificationsJson); } catch { return {}; }
}

function isDuplicateKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /unique|duplicate/i.test(msg);
}

async function getActiveConnection(tenantId: string, connectionId: string) {
  const db = await getDb();
  const conn = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.id, connectionId),
      eq(stockistConnections.pharmacyTenantId, tenantId),
      eq(stockistConnections.status, 'active'),
    ),
  });
  if (!conn) throw new Error('CONNECTION_INACTIVE:Stockist connection is not active');
  if (conn.linkedPharmacyId) {
    const linkedPharmacy = await db.query.pharmacies.findFirst({
      where: eq(pharmacies.id, conn.linkedPharmacyId),
    });
    if (linkedPharmacy && linkedPharmacy.status !== 'active') {
      throw new Error('PHARMACY_INACTIVE:Your pharmacy account is inactive or blocked by the stockist');
    }
  }
  return conn;
}

async function getPayablesOutstanding(tenantId: string, connectionId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select({
    total: payableBills.total,
    paidAmount: payableBills.paidAmount,
  }).from(payableBills).where(and(
    eq(payableBills.tenantId, tenantId),
    eq(payableBills.stockistConnectionId, connectionId),
  ));
  return rows.reduce((s, r) => s + Math.max(0, parseFloat(r.total) - parseFloat(r.paidAmount)), 0);
}

export async function createPurchaseOrder(tenantId: string, userId: string, body: {
  stockistConnectionId: string;
  orderDate: string;
  paymentMode?: 'credit' | 'cash';
  notes?: string;
  items: {
    catalogItemId?: string;
    stockistProductId: string;
    productName: string;
    qty: number;
    freeQty?: number;
    rate: number;
    gstRate: number;
  }[];
}) {
  const db = await getDb();
  await getActiveConnection(tenantId, body.stockistConnectionId);
  if (!body.items.length) throw new Error('At least one line item is required');

  const pharmacyTenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  const buyerState = pharmacyTenant?.stateCode ?? '08';

  const poNumber = await nextPharmacyPoNumber(tenantId);
  let po;
  for (let attempt = 0; attempt < 3; attempt++) {
    const num = attempt === 0 ? poNumber : await nextPharmacyPoNumber(tenantId);
    try {
      [po] = await db.insert(pharmacyPurchaseOrders).values({
        tenantId,
        stockistConnectionId: body.stockistConnectionId,
        poNumber: num,
        orderDate: body.orderDate,
        status: 'draft',
        paymentMode: body.paymentMode ?? 'credit',
        notes: body.notes,
        createdBy: userId,
        subtotal: '0',
        taxAmount: '0',
        total: '0',
      }).returning();
      break;
    } catch (err) {
      if (attempt < 2 && isDuplicateKeyError(err)) continue;
      throw err;
    }
  }
  if (!po) throw new Error('Failed to create purchase order');

  let totalSubtotal = 0;
  let totalTax = 0;
  for (const item of body.items) {
    const lineSubtotal = round2(item.rate * item.qty);
    const lineTax = round2(lineSubtotal * item.gstRate / 100);
    const lineTotal = round2(lineSubtotal + lineTax);
    await db.insert(pharmacyPurchaseOrderItems).values({
      purchaseOrderId: po.id,
      tenantId,
      catalogItemId: item.catalogItemId ?? null,
      stockistProductId: item.stockistProductId,
      productName: item.productName,
      qty: item.qty,
      freeQty: item.freeQty ?? 0,
      rate: item.rate.toString(),
      gstRate: item.gstRate.toString(),
      lineSubtotal: lineSubtotal.toString(),
      lineTax: lineTax.toString(),
      lineTotal: lineTotal.toString(),
    });
    totalSubtotal += lineSubtotal;
    totalTax += lineTax;
  }

  const total = round2(totalSubtotal + totalTax);
  await db.update(pharmacyPurchaseOrders).set({
    subtotal: totalSubtotal.toString(),
    taxAmount: totalTax.toString(),
    total: total.toString(),
  }).where(eq(pharmacyPurchaseOrders.id, po.id));

  return { ...po, subtotal: totalSubtotal, taxAmount: totalTax, total };
}

export async function updatePurchaseOrder(tenantId: string, poId: string, body: {
  orderDate?: string;
  paymentMode?: 'credit' | 'cash';
  notes?: string;
  items?: {
    catalogItemId?: string;
    stockistProductId: string;
    productName: string;
    qty: number;
    freeQty?: number;
    rate: number;
    gstRate: number;
  }[];
}) {
  const db = await getDb();
  const po = await db.query.pharmacyPurchaseOrders.findFirst({
    where: and(eq(pharmacyPurchaseOrders.id, poId), eq(pharmacyPurchaseOrders.tenantId, tenantId)),
  });
  if (!po) throw new Error('Purchase order not found');
  if (po.status !== 'draft') throw new Error('Only draft purchase orders can be edited');

  if (body.items) {
    await db.delete(pharmacyPurchaseOrderItems)
      .where(eq(pharmacyPurchaseOrderItems.purchaseOrderId, poId));

    let totalSubtotal = 0;
    let totalTax = 0;
    for (const item of body.items) {
      const lineSubtotal = round2(item.rate * item.qty);
      const lineTax = round2(lineSubtotal * item.gstRate / 100);
      const lineTotal = round2(lineSubtotal + lineTax);
      await db.insert(pharmacyPurchaseOrderItems).values({
        purchaseOrderId: poId,
        tenantId,
        catalogItemId: item.catalogItemId ?? null,
        stockistProductId: item.stockistProductId,
        productName: item.productName,
        qty: item.qty,
        freeQty: item.freeQty ?? 0,
        rate: item.rate.toString(),
        gstRate: item.gstRate.toString(),
        lineSubtotal: lineSubtotal.toString(),
        lineTax: lineTax.toString(),
        lineTotal: lineTotal.toString(),
      });
      totalSubtotal += lineSubtotal;
      totalTax += lineTax;
    }
    const total = round2(totalSubtotal + totalTax);
    await db.update(pharmacyPurchaseOrders).set({
      ...(body.orderDate ? { orderDate: body.orderDate } : {}),
      ...(body.paymentMode ? { paymentMode: body.paymentMode } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      subtotal: totalSubtotal.toString(),
      taxAmount: totalTax.toString(),
      total: total.toString(),
    }).where(eq(pharmacyPurchaseOrders.id, poId));
  } else {
    await db.update(pharmacyPurchaseOrders).set({
      ...(body.orderDate ? { orderDate: body.orderDate } : {}),
      ...(body.paymentMode ? { paymentMode: body.paymentMode } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    }).where(eq(pharmacyPurchaseOrders.id, poId));
  }

  return getPurchaseOrderDetail(tenantId, poId);
}

export async function submitPurchaseOrder(tenantId: string, poId: string, userId: string, opts?: { submittedAt?: Date }) {
  const db = await getDb();
  const po = await db.query.pharmacyPurchaseOrders.findFirst({
    where: and(eq(pharmacyPurchaseOrders.id, poId), eq(pharmacyPurchaseOrders.tenantId, tenantId)),
  });
  if (!po) throw new Error('Purchase order not found');
  if (po.status !== 'draft') throw new Error('PO_NOT_SUBMITTABLE:Only draft orders can be submitted');

  const conn = await getActiveConnection(tenantId, po.stockistConnectionId);
  if (!conn.linkedPharmacyId) throw new Error('Stockist has not linked a pharmacy record for this connection');

  const items = await db.select().from(pharmacyPurchaseOrderItems)
    .where(eq(pharmacyPurchaseOrderItems.purchaseOrderId, poId));
  if (!items.length) throw new Error('Purchase order has no items');

  // M16: validate every stockistProductId exists in the catalog for this connection.
  const { stockistCatalogItems } = await import('../db/schema.js');
  const catalogRows = await db.select({ id: stockistCatalogItems.stockistProductId })
    .from(stockistCatalogItems)
    .where(and(
      eq(stockistCatalogItems.connectionId, conn.id),
      inArray(stockistCatalogItems.stockistProductId, items.map(i => i.stockistProductId)),
    ));
  const valid = new Set(catalogRows.map(r => r.id));
  const missing = items.filter(i => !valid.has(i.stockistProductId)).map(i => i.productName);
  if (missing.length > 0) {
    throw new Error(`CATALOG_DRIFT:These products are no longer in the stockist's catalog: ${missing.join(', ')}`);
  }

  const outstanding = await getPayablesOutstanding(tenantId, po.stockistConnectionId);
  const poTotal = parseFloat(po.total);
  const creditLimit = conn.creditLimit ? parseFloat(conn.creditLimit) : null;
  if (creditLimit !== null && outstanding + poTotal > creditLimit) {
    throw new Error('CREDIT_LIMIT_EXCEEDED:Order total exceeds available credit limit');
  }

  const pharmacyTenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  const stockistTenant = await db.query.tenants.findFirst({ where: eq(tenants.id, conn.stockistTenantId) });
  const buyerState = pharmacyTenant?.stateCode ?? '08';
  const sellerState = stockistTenant?.stateCode ?? '08';
  const isInterstate = buyerState !== sellerState;
  const submittedAt = opts?.submittedAt ?? new Date();

  // C19/C20: wrap submit in a transaction with FSM guard + retry on order-number collision.
  // The PO status flip uses a conditional UPDATE so a concurrent submit can't race.
  let updated: typeof pharmacyPurchaseOrders.$inferSelect | undefined;
  let stockistOrderId = '';
  let stockistOrderNumber = '';
  await db.transaction(async (tx) => {
    let stockistOrder: typeof orders.$inferSelect | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      const num = attempt === 0
        ? await nextOrderNumber(conn.stockistTenantId, tx as DbClient)
        : await nextOrderNumber(conn.stockistTenantId, tx as DbClient);
      try {
        [stockistOrder] = await tx.insert(orders).values({
          tenantId: conn.stockistTenantId,
          pharmacyId: conn.linkedPharmacyId!,
          orderNumber: num,
          orderDate: po.orderDate,
          status: 'pending',
          paymentMode: po.paymentMode,
          subtotal: po.subtotal,
          taxAmount: po.taxAmount,
          total: po.total,
          isInterstate,
          placeOfSupply: buyerState,
          notes: po.notes,
          source: 'pharmacy_submitted',
          externalPharmacyOrderId: po.id,
          stockistConnectionId: conn.id,
          submittedAt,
          createdBy: userId,
        }).returning();
        break;
      } catch (err) {
        if (attempt < 2 && isDuplicateKeyError(err)) continue;
        throw err;
      }
    }
    if (!stockistOrder) throw new Error('Failed to allocate order number');
    stockistOrderId = stockistOrder.id;
    stockistOrderNumber = stockistOrder.orderNumber;

    // Batched insert for line items.
    await tx.insert(orderItems).values(items.map(item => ({
      orderId: stockistOrder!.id,
      tenantId: conn.stockistTenantId,
      productId: item.stockistProductId,
      qty: item.qty,
      freeQty: item.freeQty,
      rate: item.rate,
      gstRate: item.gstRate,
      lineSubtotal: item.lineSubtotal,
      lineTax: item.lineTax,
      lineTotal: item.lineTotal,
    })));

    const flipped = await tx.update(pharmacyPurchaseOrders).set({
      status: 'submitted',
      externalOrderId: stockistOrder.id,
      submittedAt,
    }).where(and(
      eq(pharmacyPurchaseOrders.id, poId),
      eq(pharmacyPurchaseOrders.status, 'draft'),
    )).returning();
    if (flipped.length === 0) throw new Error('PO_NOT_SUBMITTABLE:Purchase order is no longer in draft state');
    updated = flipped[0];
  });

  if (!updated) throw new Error('Failed to submit purchase order');

  await emitCrossTenantEvent(tenantId, conn.stockistTenantId, 'order.submitted', {
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    orderNumber: stockistOrderNumber,
    stockistOrderId,
    connectionId: conn.id,
    pharmacyName: pharmacyTenant?.businessName,
    total: poTotal,
  });

  const stockistSettings = parseTenantSettings(stockistTenant?.notificationsJson);
  if (stockistSettings.autoApprovePortalOrders) {
    try {
      // M15: skip the stale stock pre-check; the real check is inside finalizeOrder.
      await approvePharmacyOrder(conn.stockistTenantId, stockistOrderId, userId, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('CREDIT_LIMIT_EXCEEDED')) {
        await rejectPharmacyOrder(conn.stockistTenantId, stockistOrderId, 'Credit limit exceeded');
      } else if (msg.includes('INSUFFICIENT_STOCK') || msg.includes('Insufficient stock')) {
        await rejectPharmacyOrder(conn.stockistTenantId, stockistOrderId, 'Insufficient stock for auto-approval');
      } else {
        // Don't fail the submit if auto-approve has trouble; surface via event log instead.
        console.error('[auto-approve]', err);
      }
    }
  }

  return updated;
}

/**
 * C21/C22: cancel semantics depend on the stockist's order state.
 *
 *  - draft                       → hard-cancel locally, no event
 *  - submitted (stockist=pending)→ cancel both sides in one tx, emit `order.cancelled`
 *  - accepted/packed             → set PO to `cancel_requested`, emit `order.cancel_requested`;
 *                                  PO only flips to `cancelled` once we receive the
 *                                  stockist's `order.cancelled` ack in the event handler.
 *  - shipped/delivered/cancelled → refuse with a clear error
 */
export async function cancelPurchaseOrder(tenantId: string, poId: string) {
  const db = await getDb();
  const po = await db.query.pharmacyPurchaseOrders.findFirst({
    where: and(eq(pharmacyPurchaseOrders.id, poId), eq(pharmacyPurchaseOrders.tenantId, tenantId)),
  });
  if (!po) throw new Error('Purchase order not found');
  if (!['draft', 'submitted', 'accepted', 'packed'].includes(po.status)) {
    throw new Error('PO_NOT_CANCELLABLE:Purchase order cannot be cancelled in its current state');
  }

  // Draft: cancel locally only.
  if (po.status === 'draft') {
    const [row] = await db.update(pharmacyPurchaseOrders).set({ status: 'cancelled' })
      .where(and(
        eq(pharmacyPurchaseOrders.id, poId),
        eq(pharmacyPurchaseOrders.status, 'draft'),
      )).returning();
    if (!row) throw new Error('PO_NOT_CANCELLABLE:Purchase order state changed before cancellation');
    return row;
  }

  // For everything else we need the connection + stockist-side state.
  if (!po.externalOrderId || !po.stockistConnectionId) {
    throw new Error('PO_NOT_CANCELLABLE:Missing linked stockist order');
  }
  const conn = await db.query.stockistConnections.findFirst({
    where: eq(stockistConnections.id, po.stockistConnectionId),
  });
  if (!conn) throw new Error('PO_NOT_CANCELLABLE:Stockist connection not found');

  const stockistOrder = await db.query.orders.findFirst({
    where: eq(orders.id, po.externalOrderId),
  });
  if (!stockistOrder) throw new Error('PO_NOT_CANCELLABLE:Linked stockist order not found');

  if (['shipped', 'delivered', 'cancelled'].includes(stockistOrder.status)) {
    throw new Error('PO_NOT_CANCELLABLE:Stockist has already shipped or fulfilled this order');
  }

  // Submitted + stockist still pending: cancel both sides in a single tx.
  if (po.status === 'submitted' && stockistOrder.status === 'pending') {
    await db.transaction(async (tx) => {
      const cancelledOrder = await tx.update(orders).set({ status: 'cancelled' })
        .where(and(eq(orders.id, stockistOrder.id), eq(orders.status, 'pending')))
        .returning({ id: orders.id });
      if (cancelledOrder.length === 0) {
        throw new Error('PO_NOT_CANCELLABLE:Stockist order state changed during cancellation');
      }
      const cancelledPo = await tx.update(pharmacyPurchaseOrders).set({ status: 'cancelled' })
        .where(and(
          eq(pharmacyPurchaseOrders.id, poId),
          eq(pharmacyPurchaseOrders.status, 'submitted'),
        )).returning();
      if (cancelledPo.length === 0) {
        throw new Error('PO_NOT_CANCELLABLE:Purchase order state changed during cancellation');
      }
    });
    await emitCrossTenantEvent(tenantId, conn.stockistTenantId, 'order.cancelled', {
      purchaseOrderId: po.id,
      stockistOrderId: stockistOrder.id,
      externalPharmacyOrderId: po.id,
    });
    const refreshed = await db.query.pharmacyPurchaseOrders.findFirst({
      where: eq(pharmacyPurchaseOrders.id, poId),
    });
    return refreshed!;
  }

  // Accepted / packed (or submitted but stockist already packed): request only.
  // PO flips to `cancel_requested`; the actual `cancelled` happens when the stockist
  // acknowledges via the `order.cancelled` cross-tenant handler.
  const [pendingRow] = await db.update(pharmacyPurchaseOrders).set({ status: 'cancel_requested' })
    .where(and(
      eq(pharmacyPurchaseOrders.id, poId),
      inArray(pharmacyPurchaseOrders.status, ['submitted', 'accepted', 'packed']),
    )).returning();
  if (!pendingRow) throw new Error('PO_NOT_CANCELLABLE:Purchase order state changed during cancellation');
  await emitCrossTenantEvent(tenantId, conn.stockistTenantId, 'order.cancel_requested', {
    purchaseOrderId: po.id,
    externalPharmacyOrderId: po.id,
    stockistOrderId: po.externalOrderId,
  });
  return pendingRow;
}

export async function confirmPurchaseOrderReceipt(tenantId: string, poId: string) {
  const db = await getDb();
  const po = await db.query.pharmacyPurchaseOrders.findFirst({
    where: and(eq(pharmacyPurchaseOrders.id, poId), eq(pharmacyPurchaseOrders.tenantId, tenantId)),
  });
  if (!po) throw new Error('Purchase order not found');
  if (po.status !== 'shipped') {
    throw new Error('Only shipped purchase orders can be confirmed as received');
  }

  // M19/C20: conditional UPDATE so a concurrent GRN can't race the manual confirm.
  const [updated] = await db.update(pharmacyPurchaseOrders).set({ status: 'delivered' })
    .where(and(
      eq(pharmacyPurchaseOrders.id, poId),
      eq(pharmacyPurchaseOrders.status, 'shipped'),
    )).returning();
  if (!updated) throw new Error('Purchase order is no longer in shipped state');

  if (po.stockistConnectionId && po.externalOrderId) {
    const conn = await db.query.stockistConnections.findFirst({
      where: eq(stockistConnections.id, po.stockistConnectionId),
    });
    if (conn) {
      await emitCrossTenantEvent(tenantId, conn.stockistTenantId, 'order.delivered', {
        orderId: po.externalOrderId,
        externalPharmacyOrderId: po.id,
      });
    }
  }

  return updated;
}

export async function deletePurchaseOrder(tenantId: string, poId: string) {
  const db = await getDb();
  const po = await db.query.pharmacyPurchaseOrders.findFirst({
    where: and(eq(pharmacyPurchaseOrders.id, poId), eq(pharmacyPurchaseOrders.tenantId, tenantId)),
  });
  if (!po) throw new Error('Purchase order not found');
  if (po.status !== 'draft') throw new Error('Only draft purchase orders can be deleted');

  await db.delete(pharmacyPurchaseOrderItems).where(eq(pharmacyPurchaseOrderItems.purchaseOrderId, poId));
  await db.delete(pharmacyPurchaseOrders).where(eq(pharmacyPurchaseOrders.id, poId));
  return { success: true };
}

export async function listPurchaseOrders(tenantId: string, params: {
  search?: string; status?: string; stockistConnectionId?: string;
  page?: number; pageSize?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;
  const searchPattern = params.search ? `%${params.search}%` : undefined;

  const where = and(
    eq(pharmacyPurchaseOrders.tenantId, tenantId),
    params.status ? eq(pharmacyPurchaseOrders.status, params.status as any) : undefined,
    params.stockistConnectionId ? eq(pharmacyPurchaseOrders.stockistConnectionId, params.stockistConnectionId) : undefined,
    searchPattern ? ilike(pharmacyPurchaseOrders.poNumber, searchPattern) : undefined,
  );

  const rows = await db.select({
    id: pharmacyPurchaseOrders.id,
    poNumber: pharmacyPurchaseOrders.poNumber,
    orderDate: pharmacyPurchaseOrders.orderDate,
    status: pharmacyPurchaseOrders.status,
    total: pharmacyPurchaseOrders.total,
    stockistConnectionId: pharmacyPurchaseOrders.stockistConnectionId,
    stockistName: tenants.businessName,
    createdAt: pharmacyPurchaseOrders.createdAt,
  }).from(pharmacyPurchaseOrders)
    .leftJoin(stockistConnections, eq(pharmacyPurchaseOrders.stockistConnectionId, stockistConnections.id))
    .leftJoin(tenants, eq(stockistConnections.stockistTenantId, tenants.id))
    .where(where)
    .orderBy(desc(pharmacyPurchaseOrders.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total: totalCount }] = await db.select({ total: count() })
    .from(pharmacyPurchaseOrders).where(where);

  return { data: rows, total: Number(totalCount), page, pageSize, pages: Math.ceil(Number(totalCount) / pageSize) };
}

export async function getPurchaseOrderDetail(tenantId: string, poId: string) {
  const db = await getDb();
  const po = await db.query.pharmacyPurchaseOrders.findFirst({
    where: and(eq(pharmacyPurchaseOrders.id, poId), eq(pharmacyPurchaseOrders.tenantId, tenantId)),
  });
  if (!po) return null;

  const items = await db.select().from(pharmacyPurchaseOrderItems)
    .where(eq(pharmacyPurchaseOrderItems.purchaseOrderId, poId));

  const [conn] = await db.select({
    id: stockistConnections.id,
    stockistName: tenants.businessName,
    stockistTenantId: stockistConnections.stockistTenantId,
  }).from(stockistConnections)
    .leftJoin(tenants, eq(stockistConnections.stockistTenantId, tenants.id))
    .where(eq(stockistConnections.id, po.stockistConnectionId))
    .limit(1);

  const linkedBill = await db.query.payableBills.findFirst({
    where: and(
      eq(payableBills.tenantId, tenantId),
      eq(payableBills.purchaseOrderId, poId),
    ),
  });

  let linkedPayableBill: {
    id: string;
    billNumber: string;
    externalBillId: string | null;
    items: typeof payableBillItems.$inferSelect[];
  } | null = null;

  if (linkedBill) {
    const billItems = await db.select().from(payableBillItems)
      .where(eq(payableBillItems.billId, linkedBill.id));
    linkedPayableBill = {
      id: linkedBill.id,
      billNumber: linkedBill.billNumber,
      externalBillId: linkedBill.externalBillId,
      items: billItems,
    };
  }

  return { ...po, items, stockist: conn, linkedPayableBill };
}

/**
 * C22: PO status transitions accept an explicit set of allowed prior states.
 * Cross-tenant event handlers should pass `allowedFrom` so stale / out-of-order
 * events can't regress the PO (e.g., a replayed `order.accepted` after the PO
 * has already reached `shipped`).
 */
type POStatus = NonNullable<typeof pharmacyPurchaseOrders.$inferSelect.status>;

export async function updatePurchaseOrderStatus(
  tenantId: string,
  poId: string,
  updates: Partial<{
    status: POStatus;
    rejectionReason: string;
    trackingCarrier: string;
    trackingAwb: string;
    shippedAt: Date;
    approvedAt: Date;
    externalOrderId: string;
  }>,
  allowedFrom?: POStatus[],
) {
  const db = await getDb();
  const where = allowedFrom && allowedFrom.length > 0
    ? and(
        eq(pharmacyPurchaseOrders.id, poId),
        eq(pharmacyPurchaseOrders.tenantId, tenantId),
        inArray(pharmacyPurchaseOrders.status, allowedFrom),
      )
    : and(eq(pharmacyPurchaseOrders.id, poId), eq(pharmacyPurchaseOrders.tenantId, tenantId));
  const [row] = await db.update(pharmacyPurchaseOrders).set(updates).where(where).returning();
  return row;
}

export async function findPurchaseOrderByExternalOrderId(tenantId: string, externalOrderId: string) {
  const db = await getDb();
  return db.query.pharmacyPurchaseOrders.findFirst({
    where: and(
      eq(pharmacyPurchaseOrders.tenantId, tenantId),
      eq(pharmacyPurchaseOrders.externalOrderId, externalOrderId),
    ),
  });
}

export async function findPurchaseOrderById(tenantId: string, poId: string) {
  const db = await getDb();
  return db.query.pharmacyPurchaseOrders.findFirst({
    where: and(eq(pharmacyPurchaseOrders.id, poId), eq(pharmacyPurchaseOrders.tenantId, tenantId)),
  });
}
