import { getDb } from '../db/client.js';
import { returns, returnItems, pharmacies, products, bills, orders, orderItems, stockistConnections, paymentAllocations } from '../db/schema.js';
import { eq, and, desc, count, sql, or, ilike } from 'drizzle-orm';
import { releaseStock } from '../lib/inventory.js';
import { postEntry } from '../lib/ledger.js';
import { nextReturnNumber } from '../lib/ids.js';
import { round2 } from '../lib/gst.js';
import { LEDGER_ACCOUNT_CODES } from '../../../shared/constants.js';
import { emitCrossTenantEvent } from '../lib/crossTenant.js';

function parsePortalReturnMeta(notes: string | null | undefined) {
  if (!notes?.startsWith('Portal return')) return null;
  const portalReturnId = notes.match(/portalReturnId:([a-f0-9-]+)/i)?.[1];
  const connectionId = notes.match(/connectionId:([a-f0-9-]+)/i)?.[1];
  return { portalReturnId, connectionId };
}

export async function createReturn(tenantId: string, userId: string | null, body: {
  pharmacyId: string; orderId?: string; returnDate: string;
  reason: 'expired' | 'damaged' | 'wrong_item' | 'cancelled' | 'other';
  notes?: string;
  items: { productId: string; batchId?: string; orderItemId?: string; qty: number; rate: number; gstRate: number }[];
}) {
  const db = await getDb();

  if (body.orderId) {
    for (const item of body.items) {
      if (!item.orderItemId) continue;
      const orderItem = await db.query.orderItems.findFirst({
        where: and(eq(orderItems.id, item.orderItemId), eq(orderItems.tenantId, tenantId)),
      });
      if (!orderItem) throw new Error(`Order item ${item.orderItemId} not found`);

      const [{ returnedQty }] = await db.select({
        returnedQty: sql<number>`COALESCE(SUM(${returnItems.qty}), 0)`,
      }).from(returnItems)
        .innerJoin(returns, eq(returnItems.returnId, returns.id))
        .where(and(
          eq(returnItems.orderItemId, item.orderItemId),
          eq(returns.tenantId, tenantId),
        ));

      const remaining = orderItem.qty - Number(returnedQty);
      if (item.qty > remaining) {
        throw new Error(`Return qty ${item.qty} exceeds remaining returnable qty ${remaining} for order item`);
      }
    }
  }

  const returnNumber = await nextReturnNumber(tenantId);
  let totalAmount = 0;
  const itemCalcs = body.items.map(i => {
    const total = round2(i.qty * i.rate);
    totalAmount += total;
    return { ...i, lineTotal: total };
  });

  const [ret] = await db.insert(returns).values({
    tenantId, pharmacyId: body.pharmacyId, orderId: body.orderId,
    returnNumber, returnDate: body.returnDate, reason: body.reason, notes: body.notes,
    totalAmount: totalAmount.toString(), status: 'requested', createdBy: userId ?? null,
  }).returning();

  for (const item of itemCalcs) {
    await db.insert(returnItems).values({
      returnId: ret.id, tenantId, productId: item.productId,
      batchId: item.batchId ?? null, orderItemId: item.orderItemId ?? null,
      qty: item.qty, rate: item.rate.toString(), gstRate: item.gstRate.toString(),
      lineTotal: item.lineTotal.toString(),
    });
  }

  return ret;
}

/**
 * M12: stockist explicitly rejects a portal return so the pharmacy can see why.
 * Emits `return.rejected` so the pharmacy's `stockistReturns` row flips to
 * `rejected` and the user sees the reason.
 */
export async function rejectReturn(tenantId: string, returnId: string, userId: string, reason: string) {
  const db = await getDb();
  const ret = await db.query.returns.findFirst({
    where: and(eq(returns.id, returnId), eq(returns.tenantId, tenantId)),
  });
  if (!ret) throw new Error('Return not found');
  if (ret.status !== 'requested') throw new Error('Return already processed');
  if (!reason || reason.trim().length < 3) throw new Error('Reject reason is required');

  return db.transaction(async (tx) => {
    const flipped = await tx.update(returns).set({
      status: 'rejected',
      notes: ret.notes ? `${ret.notes}\nREJECTED: ${reason}` : `REJECTED: ${reason}`,
    }).where(and(eq(returns.id, returnId), eq(returns.status, 'requested'))).returning();
    if (flipped.length === 0) throw new Error('Return state changed');

    const portalMeta = parsePortalReturnMeta(ret.notes);
    const connectionId = portalMeta?.connectionId
      ?? (ret.orderId ? (await tx.query.orders.findFirst({ where: eq(orders.id, ret.orderId) }))?.stockistConnectionId : undefined);
    if (connectionId) {
      const conn = await tx.query.stockistConnections.findFirst({
        where: and(eq(stockistConnections.id, connectionId), eq(stockistConnections.stockistTenantId, tenantId)),
      });
      if (conn) {
        await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'return.rejected', {
          returnId: portalMeta?.portalReturnId,
          externalReturnId: returnId,
          externalOrderId: ret.orderId,
          reason,
        }, tx as any);
      }
    }
    return flipped[0];
  });
}

export async function processReturn(tenantId: string, returnId: string, userId: string) {
  const db = await getDb();

  // M13: wrap in a transaction with a conditional UPDATE on status to prevent
  // concurrent double-process.
  return await db.transaction(async (tx) => {
    const ret = await tx.query.returns.findFirst({ where: and(eq(returns.id, returnId), eq(returns.tenantId, tenantId)) });
    if (!ret) throw new Error('Return not found');
    if (ret.status !== 'requested') throw new Error('Return already processed');

    const items = await tx.select().from(returnItems).where(eq(returnItems.returnId, returnId));
    for (const item of items) {
      const restockable = ret.reason === 'wrong_item' || ret.reason === 'cancelled';
      if (restockable) {
        if (!item.batchId) throw new Error('Batch ID required for restockable returns');
        await releaseStock(tenantId, item.batchId, item.qty, tx as any, {
          refType: 'return',
          refId: returnId,
          refNumber: ret.returnNumber,
          reason: 'return_restock',
          productId: item.productId,
          performedBy: userId,
        });
      }
    }

    const portalMeta = parsePortalReturnMeta(ret.notes);
    const isPortalReturn = !!portalMeta;

    if (!ret.orderId && !isPortalReturn) throw new Error('Return must be linked to an order');

    // C3: compute GST-inclusive credit amount so the books balance against the
    // GST-inclusive bill total and so the stockist's GST output is correctly reversed.
    const pharmacy = await tx.query.pharmacies.findFirst({ where: eq(pharmacies.id, ret.pharmacyId) });
    const tenant = await tx.query.tenants.findFirst({ where: eq((await import('../db/schema.js')).tenants.id, tenantId) });
    const sellerState = tenant?.stateCode ?? '08';
    const buyerState = pharmacy?.stateCode ?? '08';
    const isInterstate = sellerState !== buyerState;

    const subtotal = items.reduce((s, i) => s + round2(parseFloat(i.rate) * i.qty), 0);
    const taxAmount = items.reduce((s, i) => s + round2(parseFloat(i.rate) * i.qty * parseFloat(i.gstRate) / 100), 0);
    const grossCredit = round2(subtotal + taxAmount);

    if (ret.orderId) {
      const order = await tx.query.orders.findFirst({
        where: and(eq(orders.id, ret.orderId), eq(orders.tenantId, tenantId)),
      });
      if (!order) throw new Error('Linked order not found');
      const orderTotal = parseFloat(order.total);
      if (grossCredit > orderTotal + 0.01) throw new Error('Return amount exceeds original order total');
    } else if (isPortalReturn && items.length === 0) {
      throw new Error('Portal return must include at least one item');
    }

    // Conditional status flip (M13)
    const flipped = await tx.update(returns).set({ status: 'processed', totalAmount: grossCredit.toString() })
      .where(and(eq(returns.id, returnId), eq(returns.status, 'requested')))
      .returning({ id: returns.id });
    if (flipped.length === 0) throw new Error('Return already processed');

    // C3: reduce the linked bill's paid_amount / total if there's an associated bill.
    let billCredit = 0;
    let billTotalReduction = 0;
    if (ret.orderId) {
      const linkedBill = await tx.query.bills.findFirst({ where: eq(bills.orderId, ret.orderId) });
      if (linkedBill) {
        const currentPaid = parseFloat(linkedBill.paidAmount);
        const billTotal = parseFloat(linkedBill.total);
        billCredit = Math.min(grossCredit, currentPaid);
        const remainingCredit = round2(grossCredit - billCredit);
        if (remainingCredit > 0) {
          const unpaidBalance = round2(billTotal - currentPaid);
          billTotalReduction = Math.min(remainingCredit, unpaidBalance);
          if (billTotalReduction > 0) {
            const newTotal = round2(billTotal - billTotalReduction);
            const newStatus: 'unpaid' | 'partial' | 'paid' = currentPaid >= newTotal ? 'paid' : currentPaid > 0 ? 'partial' : 'unpaid';
            await tx.update(bills).set({ total: newTotal.toString(), status: newStatus })
              .where(eq(bills.id, linkedBill.id));
          }
        }
        if (billCredit > 0) {
          const newPaid = round2(currentPaid - billCredit);
          const effectiveTotal = round2(billTotal - billTotalReduction);
          const newStatus: 'unpaid' | 'partial' | 'paid' = newPaid >= effectiveTotal ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
          await tx.update(bills).set({ paidAmount: newPaid.toString(), status: newStatus })
            .where(eq(bills.id, linkedBill.id));

          // Keep payment_allocations in sync when return credit reduces paid_amount.
          const allocs = await tx.select().from(paymentAllocations)
            .where(eq(paymentAllocations.billId, linkedBill.id))
            .orderBy(desc(paymentAllocations.allocatedAmount));
          let toReduce = billCredit;
          for (const a of allocs) {
            if (toReduce <= 0) break;
            const allocAmt = parseFloat(a.allocatedAmount);
            const reduction = Math.min(toReduce, allocAmt);
            const newAlloc = round2(allocAmt - reduction);
            if (newAlloc <= 0) {
              await tx.delete(paymentAllocations).where(eq(paymentAllocations.id, a.id));
            } else {
              await tx.update(paymentAllocations).set({ allocatedAmount: newAlloc.toString() })
                .where(eq(paymentAllocations.id, a.id));
            }
            toReduce = round2(toReduce - reduction);
          }
        }
      }
    }

    const outstandingReduction = round2(grossCredit - billCredit);
    if (outstandingReduction > 0) {
      await tx.update(pharmacies).set({
        outstanding: sql`GREATEST(0, outstanding - ${outstandingReduction})`,
      }).where(eq(pharmacies.id, ret.pharmacyId));
    }

    // Post ledger (GST-inclusive)
    await postEntry({
      tenantId, txnDate: new Date().toISOString().split('T')[0], refType: 'return', refId: returnId,
      narration: `Sales return from ${pharmacy?.name} | ${ret.returnNumber}`, createdBy: userId,
      lines: [
        { accountCode: LEDGER_ACCOUNT_CODES.SALES_RETURNS, debit: round2(subtotal) },
        ...(isInterstate
          ? [{ accountCode: LEDGER_ACCOUNT_CODES.IGST_OUTPUT, debit: round2(taxAmount) }]
          : [
              { accountCode: LEDGER_ACCOUNT_CODES.CGST_OUTPUT, debit: round2(taxAmount / 2) },
              { accountCode: LEDGER_ACCOUNT_CODES.SGST_OUTPUT, debit: round2(taxAmount - round2(taxAmount / 2)) },
            ]
        ),
        { accountCode: LEDGER_ACCOUNT_CODES.SUNDRY_DEBTORS, partnerType: 'pharmacy', partnerId: ret.pharmacyId, credit: grossCredit },
      ],
    }, tx as any);

    // C3: emit cross-tenant event with explicit credit amounts and per-bill
    // allocation so the pharmacy can mirror the credit on its payable side.
    if (isPortalReturn && portalMeta?.portalReturnId) {
      const connectionId = portalMeta.connectionId
        ?? (ret.orderId
          ? (await tx.query.orders.findFirst({ where: eq(orders.id, ret.orderId) }))?.stockistConnectionId
          : undefined);

      if (connectionId) {
        const conn = await tx.query.stockistConnections.findFirst({
          where: and(
            eq(stockistConnections.id, connectionId),
            eq(stockistConnections.stockistTenantId, tenantId),
          ),
        });
        if (conn) {
          let externalBillId: string | null = null;
          if (ret.orderId) {
            const linkedBill = await tx.query.bills.findFirst({ where: eq(bills.orderId, ret.orderId) });
            externalBillId = linkedBill?.id ?? null;
          }
          await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'return.processed', {
            returnId: portalMeta.portalReturnId,
            externalReturnId: returnId,
            externalBillId,
            creditAmount: grossCredit,
            allocationToBill: billCredit,
            billTotalReduction,
            outstandingReduction,
          }, tx as any);
        }
      }
    } else if (ret.orderId) {
      const order = await tx.query.orders.findFirst({
        where: and(eq(orders.id, ret.orderId), eq(orders.tenantId, tenantId)),
      });
      if (order?.source === 'pharmacy_submitted' && order.stockistConnectionId) {
        const conn = await tx.query.stockistConnections.findFirst({
          where: and(
            eq(stockistConnections.id, order.stockistConnectionId),
            eq(stockistConnections.stockistTenantId, tenantId),
          ),
        });
        if (conn) {
          const linkedBill = await tx.query.bills.findFirst({ where: eq(bills.orderId, ret.orderId) });
          await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'return.processed', {
            externalReturnId: returnId,
            externalOrderId: ret.orderId,
            externalBillId: linkedBill?.id ?? null,
            creditAmount: grossCredit,
            allocationToBill: billCredit,
            billTotalReduction,
            outstandingReduction,
          }, tx as any);
        }
      }
    }

    return { ...ret, status: 'processed' as const, totalAmount: grossCredit.toString() };
  });
}

export async function listReturns(tenantId: string, params: {
  pharmacyId?: string; search?: string; source?: string; page?: number; pageSize?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;

  const searchPattern = params.search ? `%${params.search}%` : undefined;
  const sourceFilter = params.source === 'portal'
    ? sql`(${returns.orderId} IS NULL AND ${returns.notes} ILIKE 'Portal return%')`
    : params.source === 'manual'
      ? sql`(${returns.orderId} IS NOT NULL OR ${returns.notes} IS NULL OR ${returns.notes} NOT ILIKE 'Portal return%')`
      : undefined;

  const where = and(
    eq(returns.tenantId, tenantId),
    params.pharmacyId ? eq(returns.pharmacyId, params.pharmacyId) : undefined,
    sourceFilter,
    searchPattern
      ? or(ilike(returns.returnNumber, searchPattern), ilike(pharmacies.name, searchPattern))
      : undefined,
  );

  const rows = await db.select({
    id: returns.id, returnNumber: returns.returnNumber, returnDate: returns.returnDate,
    reason: returns.reason, totalAmount: returns.totalAmount, status: returns.status,
    pharmacyId: returns.pharmacyId, pharmacyName: pharmacies.name, createdAt: returns.createdAt,
    orderId: returns.orderId, notes: returns.notes,
    source: sql<string>`CASE WHEN ${returns.orderId} IS NULL AND ${returns.notes} ILIKE 'Portal return%' THEN 'portal' ELSE 'manual' END`,
  }).from(returns)
    .leftJoin(pharmacies, eq(returns.pharmacyId, pharmacies.id))
    .where(where).orderBy(desc(returns.createdAt)).limit(pageSize).offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(returns)
    .leftJoin(pharmacies, eq(returns.pharmacyId, pharmacies.id))
    .where(where);
  return { data: rows, total: Number(total), page, pageSize, pages: Math.ceil(Number(total) / pageSize) };
}
