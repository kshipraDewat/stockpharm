import { getDb, type DbClient } from '../db/client.js';
import {
  pharmacyGrns, pharmacyGrnItems, pharmacyPurchaseOrders, pharmacyPurchaseOrderItems,
  productBatches, products, stockistCatalogItems, stockistConnections, tenants,
} from '../db/schema.js';
import { eq, and, desc, count, ilike, sql } from 'drizzle-orm';
import { nextPharmacyGrnNumber } from '../lib/ids.js';
import { validateExpiryDate } from '../lib/expiry.js';
import { postEntry } from '../lib/ledger.js';
import { round2 } from '../lib/gst.js';
import { LEDGER_ACCOUNT_CODES } from '../../../shared/constants.js';
import { emitCrossTenantEvent } from '../lib/crossTenant.js';
import { recordStockMovement } from '../lib/stockLedger.js';

export async function createGrn(tenantId: string, userId: string, body: {
  purchaseOrderId: string;
  receivedDate: string;
  notes?: string;
  items: {
    purchaseOrderItemId?: string;
    productId: string;
    batchNumber: string;
    expiryDate: string;
    qty: number;
    freeQty?: number;
    mrp: number;
    purchaseRate: number;
    saleRate: number;
  }[];
}) {
  const db = await getDb();
  const po = await db.query.pharmacyPurchaseOrders.findFirst({
    where: and(eq(pharmacyPurchaseOrders.id, body.purchaseOrderId), eq(pharmacyPurchaseOrders.tenantId, tenantId)),
  });
  if (!po) throw new Error('Purchase order not found');
  if (!['delivered', 'partially_received'].includes(po.status)) {
    throw new Error('GRN can only be received for delivered purchase orders');
  }
  if (!body.items.length) throw new Error('At least one GRN line is required');

  const poItems = await db.select().from(pharmacyPurchaseOrderItems)
    .where(eq(pharmacyPurchaseOrderItems.purchaseOrderId, body.purchaseOrderId));

  // C10: pre-aggregate body items by purchaseOrderItemId so split lines (e.g.
  // one PO line received in two batches) compound correctly.
  const aggByPoItem = new Map<string, number>();
  for (const item of body.items) {
    if (!item.purchaseOrderItemId) continue;
    const total = item.qty + (item.freeQty ?? 0);
    aggByPoItem.set(item.purchaseOrderItemId, (aggByPoItem.get(item.purchaseOrderItemId) ?? 0) + total);
  }

  for (const [poItemId, total] of aggByPoItem) {
    const poItem = poItems.find(i => i.id === poItemId);
    if (!poItem) throw new Error('Invalid purchase order item');
    const pending = poItem.qty + poItem.freeQty - poItem.receivedQty;
    if (total > pending) {
      throw new Error(`Cumulative received qty (${total}) exceeds pending qty (${pending}) for ${poItem.productName}`);
    }
  }

  // Pre-validate every item before opening the transaction.
  for (const item of body.items) {
    const expiry = validateExpiryDate(item.expiryDate);
    // me54: compare against GRN received date so backdated receipts validate correctly.
    if (expiry <= body.receivedDate) throw new Error('EXPIRED_BATCH:Expiry date must be after the received date');

    const product = await db.query.products.findFirst({
      where: and(eq(products.id, item.productId), eq(products.tenantId, tenantId)),
    });
    if (!product) throw new Error(`Product ${item.productId} not found`);
  }

  // C9: wrap the entire write set in a transaction.
  const result = await db.transaction(async (tx) => {
    const grnNumber = await nextPharmacyGrnNumber(tenantId, tx as DbClient);
    let inventoryValue = 0;
    let inventoryFreeValue = 0;
    let partial = false;

    const [grn] = await tx.insert(pharmacyGrns).values({
      tenantId,
      purchaseOrderId: body.purchaseOrderId,
      stockistConnectionId: po.stockistConnectionId,
      grnNumber,
      receivedDate: body.receivedDate,
      status: 'received', // will be flipped to 'partial' below if any line is short
      notes: body.notes,
      createdBy: userId,
    }).returning();

    for (const item of body.items) {
      const expiry = validateExpiryDate(item.expiryDate);
      const totalQty = item.qty + (item.freeQty ?? 0);

      // C11: upsert batch on (tenant, product, batchNumber, expiry).
      const existingBatch = await tx.query.productBatches.findFirst({
        where: and(
          eq(productBatches.tenantId, tenantId),
          eq(productBatches.productId, item.productId),
          eq(productBatches.batchNumber, item.batchNumber),
          eq(productBatches.expiryDate, expiry),
        ),
      });

      let batchId: string;
      if (existingBatch) {
        await tx.update(productBatches).set({
          qtyReceived: existingBatch.qtyReceived + totalQty,
          qtyOnHand: existingBatch.qtyOnHand + totalQty,
          mrp: item.mrp.toString(),
          purchaseRate: item.purchaseRate.toString(),
          saleRate: item.saleRate.toString(),
        }).where(eq(productBatches.id, existingBatch.id));
        batchId = existingBatch.id;
      } else {
        const [batch] = await tx.insert(productBatches).values({
          tenantId,
          productId: item.productId,
          batchNumber: item.batchNumber,
          expiryDate: expiry,
          mrp: item.mrp.toString(),
          purchaseRate: item.purchaseRate.toString(),
          saleRate: item.saleRate.toString(),
          qtyReceived: totalQty,
          qtyOnHand: totalQty,
          sourcePurchaseId: null,
        }).returning();
        batchId = batch.id;
      }

      if (item.purchaseOrderItemId) {
        const poItem = poItems.find(i => i.id === item.purchaseOrderItemId);
        if (poItem) {
          // me8: only set catalog mapping if currently unset, and only when the
          // pharmacy hasn't already mapped this stockist product to a different
          // local one.
          const existingMap = await tx.query.stockistCatalogItems.findFirst({
            where: and(
              eq(stockistCatalogItems.connectionId, po.stockistConnectionId),
              eq(stockistCatalogItems.stockistProductId, poItem.stockistProductId),
            ),
          });
          if (existingMap && (!existingMap.localProductId || existingMap.localProductId === item.productId)) {
            await tx.update(stockistCatalogItems).set({ localProductId: item.productId })
              .where(eq(stockistCatalogItems.id, existingMap.id));
          }
        }
      }

      await tx.insert(pharmacyGrnItems).values({
        grnId: grn.id,
        tenantId,
        purchaseOrderItemId: item.purchaseOrderItemId ?? null,
        productId: item.productId,
        batchId,
        batchNumber: item.batchNumber,
        expiryDate: expiry,
        qty: item.qty,
        freeQty: item.freeQty ?? 0,
        mrp: item.mrp.toString(),
        purchaseRate: item.purchaseRate.toString(),
        saleRate: item.saleRate.toString(),
      });

      // C24: log the stock receipt in the canonical movement ledger.
      await recordStockMovement({
        tenantId,
        batchId,
        productId: item.productId,
        delta: totalQty,
        reason: 'grn_receive',
        refType: 'grn',
        refId: grn.id,
        refNumber: grnNumber,
        performedBy: userId,
      }, tx as any);

      inventoryValue += item.purchaseRate * item.qty;
      inventoryFreeValue += item.purchaseRate * (item.freeQty ?? 0);
    }

  // C10: increment PO line received_qty inside the transaction with a conditional
  // guard so concurrent GRNs cannot over-receive (GRN-001).
  for (const [poItemId, total] of aggByPoItem) {
    const poItem = poItems.find(i => i.id === poItemId);
    if (!poItem) throw new Error('Invalid purchase order item');
    const updated = await tx.update(pharmacyPurchaseOrderItems)
      .set({ receivedQty: sql`${pharmacyPurchaseOrderItems.receivedQty} + ${total}` })
      .where(and(
        eq(pharmacyPurchaseOrderItems.id, poItemId),
        sql`${pharmacyPurchaseOrderItems.receivedQty} + ${total} <= ${pharmacyPurchaseOrderItems.qty} + ${pharmacyPurchaseOrderItems.freeQty}`,
      ))
      .returning({ id: pharmacyPurchaseOrderItems.id });
    if (updated.length === 0) {
      throw new Error(`OVER_RECEIVE:Cannot receive ${total} units for ${poItem.productName} — pending qty exceeded`);
    }
  }

    const refreshedItems = await tx.select().from(pharmacyPurchaseOrderItems)
      .where(eq(pharmacyPurchaseOrderItems.purchaseOrderId, body.purchaseOrderId));
    const fullyReceived = refreshedItems.every(i => i.receivedQty >= i.qty + i.freeQty);
    partial = !fullyReceived;
    await tx.update(pharmacyPurchaseOrders).set({
      status: fullyReceived ? 'received' : 'partially_received',
    }).where(eq(pharmacyPurchaseOrders.id, body.purchaseOrderId));

    if (partial) {
      await tx.update(pharmacyGrns).set({ status: 'partial' as any })
        .where(eq(pharmacyGrns.id, grn.id));
    }

    // C2/M21: post Inventory Dr / GRN_CLEARING Cr at gross cost. The matching
    // payable bill (when it arrives via `bill.generated`) will Dr GRN_CLEARING
    // + Dr GST_INPUT and Cr Sundry Creditors so the two sides net out.
    await postEntry({
      tenantId,
      txnDate: body.receivedDate,
      refType: 'purchase',
      refId: grn.id,
      narration: `GRN ${grnNumber} from stockist PO ${po.poNumber}`,
      createdBy: userId,
      lines: [
        { accountCode: LEDGER_ACCOUNT_CODES.INVENTORY, debit: round2(inventoryValue + inventoryFreeValue) },
        { accountCode: LEDGER_ACCOUNT_CODES.GRN_CLEARING, credit: round2(inventoryValue + inventoryFreeValue) },
      ],
    }, tx as any);

    return { grnId: grn.id, grnNumber, fullyReceived };
  });

  // M20: notify the stockist that goods were received.
  try {
    const conn = await db.query.stockistConnections.findFirst({
      where: eq(stockistConnections.id, po.stockistConnectionId),
    });
    if (conn?.status === 'active') {
      await emitCrossTenantEvent(tenantId, conn.stockistTenantId,
        result.fullyReceived ? 'order.received' : 'order.partially_received', {
        connectionId: po.stockistConnectionId,
        externalOrderId: po.externalOrderId,
        externalPharmacyOrderId: po.id,
        poNumber: po.poNumber,
        grnNumber: result.grnNumber,
        receivedDate: body.receivedDate,
        items: body.items.map(i => ({
          stockistProductId: poItems.find(p => p.id === i.purchaseOrderItemId)?.stockistProductId,
          qtyReceived: i.qty + (i.freeQty ?? 0),
          batchNumber: i.batchNumber,
          expiryDate: i.expiryDate,
        })),
      });
    }
  } catch (e) {
    console.error('[grn->stockist notify]', e);
  }

  return getGrnDetail(tenantId, result.grnId);
}

export async function listGrns(tenantId: string, params: {
  search?: string; stockistConnectionId?: string;
  page?: number; pageSize?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;
  const searchPattern = params.search ? `%${params.search}%` : undefined;

  const where = and(
    eq(pharmacyGrns.tenantId, tenantId),
    params.stockistConnectionId ? eq(pharmacyGrns.stockistConnectionId, params.stockistConnectionId) : undefined,
    searchPattern ? ilike(pharmacyGrns.grnNumber, searchPattern) : undefined,
  );

  const rows = await db.select({
    id: pharmacyGrns.id,
    grnNumber: pharmacyGrns.grnNumber,
    receivedDate: pharmacyGrns.receivedDate,
    status: pharmacyGrns.status,
    purchaseOrderId: pharmacyGrns.purchaseOrderId,
    poNumber: pharmacyPurchaseOrders.poNumber,
    stockistName: tenants.businessName,
    createdAt: pharmacyGrns.createdAt,
  }).from(pharmacyGrns)
    .leftJoin(pharmacyPurchaseOrders, eq(pharmacyGrns.purchaseOrderId, pharmacyPurchaseOrders.id))
    .leftJoin(stockistConnections, eq(pharmacyGrns.stockistConnectionId, stockistConnections.id))
    .leftJoin(tenants, eq(stockistConnections.stockistTenantId, tenants.id))
    .where(where)
    .orderBy(desc(pharmacyGrns.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(pharmacyGrns).where(where);
  return { data: rows, total: Number(total), page, pageSize, pages: Math.ceil(Number(total) / pageSize) };
}

export async function getGrnDetail(tenantId: string, grnId: string) {
  const db = await getDb();
  const grn = await db.query.pharmacyGrns.findFirst({
    where: and(eq(pharmacyGrns.id, grnId), eq(pharmacyGrns.tenantId, tenantId)),
  });
  if (!grn) return null;

  const items = await db.select({
    id: pharmacyGrnItems.id,
    productId: pharmacyGrnItems.productId,
    productName: products.name,
    batchNumber: pharmacyGrnItems.batchNumber,
    expiryDate: pharmacyGrnItems.expiryDate,
    qty: pharmacyGrnItems.qty,
    freeQty: pharmacyGrnItems.freeQty,
    mrp: pharmacyGrnItems.mrp,
    purchaseRate: pharmacyGrnItems.purchaseRate,
    saleRate: pharmacyGrnItems.saleRate,
    batchId: pharmacyGrnItems.batchId,
  }).from(pharmacyGrnItems)
    .leftJoin(products, eq(pharmacyGrnItems.productId, products.id))
    .where(eq(pharmacyGrnItems.grnId, grnId));

  const po = await db.query.pharmacyPurchaseOrders.findFirst({
    where: eq(pharmacyPurchaseOrders.id, grn.purchaseOrderId),
  });

  return { ...grn, items, purchaseOrder: po };
}
