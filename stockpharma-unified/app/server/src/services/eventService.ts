import { getDb } from '../db/client.js';
import { crossTenantEvents, stockistConnections, stockistReturns, stockistReturnItems, orderItems, productBatches, bills, orders, processedCrossTenantEvents, payments } from '../db/schema.js';
import { eq, and, isNull, asc, desc, sql } from 'drizzle-orm';
import {
  updatePurchaseOrderStatus,
  findPurchaseOrderByExternalOrderId,
  findPurchaseOrderById,
} from './pharmacyPurchaseOrderService.js';
import { createPayableBillFromEvent } from './payableBillService.js';
import { createReturn } from './returnService.js';
import { recordPayment, voidPayment } from './paymentService.js';
import { pushCatalogToActiveConnections } from './connectionService.js';
import { cancelOrder, cancelApprovedPharmacyOrder } from './orderService.js';
import { releaseStock } from '../lib/inventory.js';
import { postEntry } from '../lib/ledger.js';
import { LEDGER_ACCOUNT_CODES } from '../../../shared/constants.js';
import { round2 } from '../lib/gst.js';

export async function pollEvents(tenantId: string, limit = 50) {
  const db = await getDb();
  return db.select().from(crossTenantEvents)
    .where(and(
      eq(crossTenantEvents.targetTenantId, tenantId),
      isNull(crossTenantEvents.deliveredAt),
    ))
    .orderBy(asc(crossTenantEvents.createdAt))
    .limit(limit);
}

export async function ackEvent(tenantId: string, eventId: string) {
  const db = await getDb();
  const [row] = await db.update(crossTenantEvents).set({ deliveredAt: new Date() })
    .where(and(
      eq(crossTenantEvents.id, eventId),
      eq(crossTenantEvents.targetTenantId, tenantId),
    ))
    .returning();
  if (!row) throw new Error('Event not found');
  return row;
}

export async function listEventHistory(tenantId: string, limit = 20) {
  const db = await getDb();
  return db.select().from(crossTenantEvents)
    .where(eq(crossTenantEvents.targetTenantId, tenantId))
    .orderBy(desc(crossTenantEvents.createdAt))
    .limit(limit);
}

export async function applyEvent(tenantId: string, event: {
  id: string;
  eventType: string;
  payloadJson: string;
}) {
  const db = await getDb();
  // Atomic claim: only one concurrent processor runs the handler (BE-C1).
  const [claimed] = await db.insert(processedCrossTenantEvents).values({ tenantId, eventId: event.id })
    .onConflictDoNothing()
    .returning({ eventId: processedCrossTenantEvents.eventId });
  if (!claimed) {
    await ackEvent(tenantId, event.id).catch(() => {});
    return null;
  }

  const payload = JSON.parse(event.payloadJson) as Record<string, unknown>;
  try {
    await handleEvent(tenantId, event.eventType, payload);
  } catch (err) {
    await db.delete(processedCrossTenantEvents).where(and(
      eq(processedCrossTenantEvents.tenantId, tenantId),
      eq(processedCrossTenantEvents.eventId, event.id),
    ));
    throw err;
  }
  return ackEvent(tenantId, event.id);
}

export async function processPendingEvents(tenantId: string) {
  const events = await pollEvents(tenantId);
  const results = [];
  for (const event of events) {
    try {
      await applyEvent(tenantId, event);
      results.push({ eventId: event.id, eventType: event.eventType, status: 'applied' });
    } catch (err) {
      results.push({
        eventId: event.id,
        eventType: event.eventType,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

async function handleEvent(tenantId: string, eventType: string, payload: Record<string, unknown>) {
  const poId = (payload.externalPharmacyOrderId ?? payload.purchaseOrderId) as string | undefined;
  const stockistOrderId = payload.orderId as string | undefined;

  let po = poId ? await findPurchaseOrderById(tenantId, poId) : null;
  if (!po && stockistOrderId) {
    po = await findPurchaseOrderByExternalOrderId(tenantId, stockistOrderId);
  }

  switch (eventType) {
    // C22: pass allowedFrom so stale/replayed events cannot regress PO state.
    case 'order.accepted':
      if (po) {
        await updatePurchaseOrderStatus(tenantId, po.id, {
          status: 'accepted',
          approvedAt: new Date(),
          externalOrderId: stockistOrderId ?? po.externalOrderId ?? undefined,
        }, ['submitted']);
      }
      break;

    case 'order.rejected':
      if (po) {
        await updatePurchaseOrderStatus(tenantId, po.id, {
          status: 'rejected',
          rejectionReason: (payload.reason as string) ?? 'Rejected by stockist',
        }, ['submitted']);
      }
      break;

    case 'order.packed':
      if (po) await updatePurchaseOrderStatus(tenantId, po.id, { status: 'packed' }, ['accepted']);
      break;

    case 'order.shipped':
      if (po) {
        await updatePurchaseOrderStatus(tenantId, po.id, {
          status: 'shipped',
          trackingCarrier: payload.carrier as string | undefined,
          trackingAwb: payload.awb as string | undefined,
          shippedAt: payload.shippedAt ? new Date(payload.shippedAt as string) : new Date(),
        }, ['accepted', 'packed']);
      }
      break;

    case 'order.delivered':
      if (po) await updatePurchaseOrderStatus(tenantId, po.id, { status: 'delivered' },
        ['shipped', 'partially_received']);
      break;

    case 'order.received':
      // Notification-only — GRN inventory receipt; PO status already updated by pharmacyGrnService.
      break;

    case 'order.partially_received':
      if (po) await updatePurchaseOrderStatus(tenantId, po.id, { status: 'partially_received' },
        ['shipped']);
      break;

    case 'order.cancelled':
      if (po) await updatePurchaseOrderStatus(tenantId, po.id, { status: 'cancelled' },
        ['submitted', 'accepted', 'packed', 'cancel_requested']);
      break;

    case 'bill.generated':
      await createPayableBillFromEvent(tenantId, {
        connectionId: payload.connectionId as string,
        externalBillId: payload.externalBillId as string,
        externalOrderId: payload.externalOrderId as string | undefined,
        externalPharmacyOrderId: payload.externalPharmacyOrderId as string | undefined,
        billNumber: payload.billNumber as string,
        stockistName: payload.stockistName as string,
        billDate: payload.billDate as string,
        dueDate: payload.dueDate as string,
        isInterstate: payload.isInterstate as boolean | undefined,
        placeOfSupply: payload.placeOfSupply as string | undefined,
        subtotal: Number(payload.subtotal),
        cgst: Number(payload.cgst),
        sgst: Number(payload.sgst),
        igst: Number(payload.igst),
        total: Number(payload.total),
        items: (payload.items as any[]) ?? [],
      });
      break;

    // Notification-only — shared rows already written by the source tenant's service call.
    case 'connection.requested':
    case 'order.submitted':
      break;

    case 'connection.approved': {
      const connectionId = payload.connectionId as string;
      if (!connectionId) break;
      const db = await getDb();
      await db.update(stockistConnections).set({
        status: 'active',
        connectedAt: new Date(),
        creditLimit: payload.creditLimit != null ? String(payload.creditLimit) : undefined,
        paymentTermsDays: payload.paymentTermsDays as number | undefined,
        rejectionReason: null,
      }).where(and(
        eq(stockistConnections.id, connectionId),
        eq(stockistConnections.pharmacyTenantId, tenantId),
      ));
      break;
    }

    case 'connection.rejected': {
      const connectionId = payload.connectionId as string;
      if (!connectionId) break;
      const db = await getDb();
      await db.update(stockistConnections).set({
        status: 'rejected',
        rejectionReason: (payload.reason as string) ?? 'Rejected by stockist',
      }).where(and(
        eq(stockistConnections.id, connectionId),
        eq(stockistConnections.pharmacyTenantId, tenantId),
      ));
      break;
    }

    case 'connection.disconnected': {
      const connectionId = payload.connectionId as string;
      if (!connectionId) break;
      const db = await getDb();
      await db.update(stockistConnections).set({
        status: 'disconnected',
        disconnectedAt: new Date(),
      }).where(and(
        eq(stockistConnections.id, connectionId),
        eq(stockistConnections.pharmacyTenantId, tenantId),
      ));
      break;
    }

    case 'connection.withdrawn': {
      const connectionId = payload.connectionId as string;
      if (!connectionId) break;
      const db = await getDb();
      await db.update(stockistConnections).set({ status: 'withdrawn' })
        .where(and(
          eq(stockistConnections.id, connectionId),
          eq(stockistConnections.stockistTenantId, tenantId),
        ));
      break;
    }

    case 'payment.recorded': {
      const connectionId = payload.connectionId as string;
      if (!connectionId) break;
      const db = await getDb();
      const conn = await db.query.stockistConnections.findFirst({
        where: and(
          eq(stockistConnections.id, connectionId),
          eq(stockistConnections.stockistTenantId, tenantId),
        ),
      });
      if (!conn?.linkedPharmacyId) {
        throw new Error('PAYMENT_EVENT_NO_CONNECTION:Stockist connection missing linked pharmacy');
      }

      const rawAllocations = (payload.allocations as { externalBillId: string; amount: number }[]) ?? [];
      const stockistAllocations: { billId: string; amount: number }[] = [];
      for (const alloc of rawAllocations) {
        const bill = await db.query.bills.findFirst({
          where: and(eq(bills.id, alloc.externalBillId), eq(bills.tenantId, tenantId)),
        });
        if (bill) stockistAllocations.push({ billId: bill.id, amount: alloc.amount });
      }

      if (stockistAllocations.length === 0) {
        throw new Error('PAYMENT_EVENT_NO_BILLS:Could not resolve any stockist bill allocations from payment event');
      }

      await recordPayment(tenantId, null, {
        pharmacyId: conn.linkedPharmacyId,
        paymentDate: payload.paymentDate as string,
        method: payload.method as string,
        referenceNo: payload.referenceNo as string | undefined,
        amount: Number(payload.amount),
        notes: `Portal payment ${payload.paymentNumber ?? ''}`.trim(),
        allocations: stockistAllocations,
      });
      break;
    }

    // M2: void event from pharmacy → use voidPayment-like compensation on stockist side.
    case 'payment.voided': {
      const connectionId = payload.connectionId as string;
      const paymentNumber = payload.paymentNumber as string;
      const rawAllocations = (payload.allocations as { externalBillId: string; amount: number }[]) ?? [];
      if (!connectionId || !paymentNumber || rawAllocations.length === 0) {
        throw new Error('PAYMENT_VOID_INCOMPLETE:Void event missing connection, payment number, or allocations');
      }
      const db = await getDb();
      const conn = await db.query.stockistConnections.findFirst({
        where: and(
          eq(stockistConnections.id, connectionId),
          eq(stockistConnections.stockistTenantId, tenantId),
        ),
      });
      if (!conn?.linkedPharmacyId) {
        throw new Error('PAYMENT_VOID_NO_CONNECTION:Stockist connection missing linked pharmacy');
      }
      const payment = await db.query.payments.findFirst({
        where: and(
          eq(payments.tenantId, tenantId),
          eq(payments.pharmacyId, conn.linkedPharmacyId),
          eq(payments.status, 'successful'),
          sql`${payments.notes} ILIKE ${`%Portal payment ${paymentNumber}%`}`,
        ),
      });
      if (payment) {
        await voidPayment(tenantId, payment.id, 'system');
      }
      break;
    }

    case 'catalog.changed':
      await pushCatalogToActiveConnections(tenantId);
      break;

    case 'return.requested': {
      const db = await getDb();
      const conn = await db.query.stockistConnections.findFirst({
        where: and(
          eq(stockistConnections.id, payload.connectionId as string),
          eq(stockistConnections.stockistTenantId, tenantId),
        ),
      });
      if (!conn?.linkedPharmacyId) {
        throw new Error('RETURN_REQUEST_NO_CONNECTION:Stockist connection missing linked pharmacy');
      }
      const items = (payload.items as any[]) ?? [];
      if (items.length === 0) {
        throw new Error('RETURN_REQUEST_NO_ITEMS:Return request has no line items');
      }

      const stockistOrderId = payload.orderId as string | undefined;
      const portalReturnId = payload.returnId as string | undefined;
      const connectionId = payload.connectionId as string;

      const mappedItems: {
        productId: string;
        batchId?: string;
        orderItemId?: string;
        qty: number;
        rate: number;
        gstRate: number;
      }[] = [];

      for (const item of items) {
        const productId = item.productId as string;
        let batchId = item.batchId as string | undefined;
        let orderItemId: string | undefined;

        if (stockistOrderId) {
          const orderItemRows = await db.select({
            id: orderItems.id,
            batchId: orderItems.batchId,
            batchNumber: productBatches.batchNumber,
          }).from(orderItems)
            .leftJoin(productBatches, eq(orderItems.batchId, productBatches.id))
            .where(and(
              eq(orderItems.orderId, stockistOrderId),
              eq(orderItems.tenantId, tenantId),
              eq(orderItems.productId, productId),
            ));

          const batchNumber = item.batchNumber as string | undefined;
          const match = batchNumber
            ? orderItemRows.find(r => r.batchNumber === batchNumber) ?? orderItemRows[0]
            : orderItemRows[0];

          if (match) {
            orderItemId = match.id;
            if (!batchId && match.batchId) batchId = match.batchId;
          }
        }

        mappedItems.push({
          productId,
          batchId,
          orderItemId,
          qty: item.qty,
          rate: Number(item.rate),
          gstRate: Number(item.gstRate ?? 0),
        });
      }

      const portalNotes = [
        `Portal return ${payload.returnNumber ?? ''}`.trim(),
        portalReturnId ? `portalReturnId:${portalReturnId}` : '',
        connectionId ? `connectionId:${connectionId}` : '',
      ].filter(Boolean).join('|');

      await createReturn(tenantId, null, {
        pharmacyId: conn.linkedPharmacyId,
        orderId: stockistOrderId,
        returnDate: new Date().toISOString().split('T')[0],
        reason: (payload.reason as any) ?? 'other',
        notes: portalNotes,
        items: mappedItems,
      });
      break;
    }

    // M12: pharmacy receives a rejection — flip the stockistReturns row.
    case 'return.rejected': {
      const returnId = payload.returnId as string | undefined;
      const externalOrderId = payload.externalOrderId as string | undefined;
      const externalReturnId = payload.externalReturnId as string | undefined;
      const reason = (payload.reason as string | undefined) ?? 'Rejected by stockist';
      const db = await getDb();

      const restoreReturnStock = async (id: string) => {
        const items = await db.select({
          batchId: stockistReturnItems.batchId,
          productId: stockistReturnItems.productId,
          qty: stockistReturnItems.qty,
        }).from(stockistReturnItems).where(and(
          eq(stockistReturnItems.returnId, id),
          eq(stockistReturnItems.tenantId, tenantId),
        ));
        for (const item of items) {
          if (item.batchId) {
            await releaseStock(tenantId, item.batchId, item.qty, undefined, {
              refType: 'return',
              refId: id,
              reason: 'return_restock',
              productId: item.productId,
            });
          }
        }
      };

      if (returnId) {
        await restoreReturnStock(returnId);
        await db.update(stockistReturns).set({
          status: 'rejected' as any,
          externalReturnId,
          rejectionReason: reason,
        }).where(and(
          eq(stockistReturns.id, returnId),
          eq(stockistReturns.tenantId, tenantId),
        ));
      } else if (externalOrderId) {
        const po = await findPurchaseOrderByExternalOrderId(tenantId, externalOrderId);
        if (po) {
          const pending = await db.select({ id: stockistReturns.id }).from(stockistReturns).where(and(
            eq(stockistReturns.tenantId, tenantId),
            eq(stockistReturns.purchaseOrderId, po.id),
            eq(stockistReturns.status, 'requested'),
          ));
          if (pending.length === 1) {
            await restoreReturnStock(pending[0].id);
            await db.update(stockistReturns).set({
              status: 'rejected' as any,
              externalReturnId,
              rejectionReason: reason,
            }).where(eq(stockistReturns.id, pending[0].id));
          }
        }
      }
      break;
    }

    case 'return.processed': {
      const returnId = payload.returnId as string | undefined;
      const externalOrderId = payload.externalOrderId as string | undefined;
      const externalReturnId = payload.externalReturnId as string | undefined;
      const externalBillId = payload.externalBillId as string | undefined;
      const allocationToBill = Number(payload.allocationToBill ?? 0);
      const outstandingReduction = Number(payload.outstandingReduction ?? 0);
      const db = await getDb();

      // C3 reciprocal: apply credit on pharmacy payable bill first — do not mark return
      // processed until credit succeeds (avoids race when bill.generated arrives later).
      const billTotalReduction = Number(payload.billTotalReduction ?? 0);
      const creditAmount = Number(payload.creditAmount ?? allocationToBill + billTotalReduction);
      if (externalBillId && creditAmount > 0) {
        const { payableBills } = await import('../db/schema.js');
        await db.transaction(async (tx) => {
          const payable = await tx.query.payableBills.findFirst({
            where: and(eq(payableBills.tenantId, tenantId), eq(payableBills.externalBillId, externalBillId)),
          });
          if (!payable) {
            throw new Error(`RETURN_PAYABLE_NOT_FOUND:No payable bill for external bill ${externalBillId}`);
          }
          const billTotal = parseFloat(payable.total);
          let newPaid = parseFloat(payable.paidAmount);
          let newTotal = billTotal;
          if (allocationToBill > 0) {
            newPaid = Math.max(0, newPaid - allocationToBill);
          }
          if (billTotalReduction > 0) {
            newTotal = Math.max(0, round2(billTotal - billTotalReduction));
          }
          const newStatus: 'unpaid' | 'partial' | 'paid' = newPaid >= newTotal ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
          await tx.update(payableBills).set({
            paidAmount: newPaid.toString(),
            total: newTotal.toString(),
            status: newStatus,
          }).where(eq(payableBills.id, payable.id));
          await postEntry({
            tenantId,
            txnDate: new Date().toISOString().split('T')[0],
            refType: 'return',
            refId: returnId ?? payable.id,
            narration: `Purchase return credit | ${payable.billNumber}`,
            createdBy: 'system',
            lines: [
              { accountCode: LEDGER_ACCOUNT_CODES.SUNDRY_CREDITORS, debit: creditAmount },
              { accountCode: LEDGER_ACCOUNT_CODES.PURCHASES, credit: creditAmount },
            ],
          }, tx as any);
        });
      }

      if (returnId) {
        await db.update(stockistReturns).set({
          status: 'processed',
          externalReturnId,
        }).where(and(
          eq(stockistReturns.id, returnId),
          eq(stockistReturns.tenantId, tenantId),
        ));
      } else if (externalOrderId) {
        const po = await findPurchaseOrderByExternalOrderId(tenantId, externalOrderId);
        if (po) {
          const pending = await db.select({ id: stockistReturns.id }).from(stockistReturns).where(and(
            eq(stockistReturns.tenantId, tenantId),
            eq(stockistReturns.purchaseOrderId, po.id),
            eq(stockistReturns.status, 'requested'),
          ));
          if (pending.length === 1) {
            await db.update(stockistReturns).set({
              status: 'processed',
              externalReturnId,
            }).where(eq(stockistReturns.id, pending[0].id));
          }
        }
      }

      // outstandingReduction is informational on the pharmacy side — payableBills
      // are the canonical truth, no separate aggregate to update.
      void outstandingReduction;
      break;
    }

    case 'order.cancel_requested': {
      const stockistOrderId = (payload.stockistOrderId ?? payload.orderId) as string | undefined;
      if (!stockistOrderId) {
        throw new Error('CANCEL_REQUEST_INCOMPLETE:Cancel request missing stockist order id');
      }
      const db = await getDb();
      const stockistOrder = await db.query.orders.findFirst({
        where: and(eq(orders.id, stockistOrderId), eq(orders.tenantId, tenantId)),
      });
      if (!stockistOrder) {
        throw new Error(`CANCEL_REQUEST_ORDER_NOT_FOUND:Stockist order ${stockistOrderId} not found`);
      }
      const reason = (payload.reason as string) ?? 'Cancelled per pharmacy request';
      if (stockistOrder.status === 'pending' && stockistOrder.approvedAt) {
        await cancelApprovedPharmacyOrder(tenantId, stockistOrderId, reason);
      } else if (['pending', 'packed'].includes(stockistOrder.status)) {
        await cancelOrder(tenantId, stockistOrderId, 'system');
      } else {
        throw new Error(`CANCEL_REQUEST_INVALID_STATUS:Cannot cancel order in status ${stockistOrder.status}`);
      }
      break;
    }

    default:
      throw new Error(`UNKNOWN_EVENT_TYPE:Unhandled cross-tenant event type ${eventType}`);
  }
}
