import { getDb } from '../db/client.js';
import {
  stockistReturns, stockistReturnItems, stockistConnections, products, productBatches,
  pharmacyPurchaseOrders, pharmacyPurchaseOrderItems, payableBills, payableBillItems,
  stockistCatalogItems,
} from '../db/schema.js';
import { eq, and, desc, count, notInArray, sql } from 'drizzle-orm';
import { nextStockistReturnNumber } from '../lib/ids.js';
import { round2 } from '../lib/gst.js';
import { emitCrossTenantEvent } from '../lib/crossTenant.js';
import { reserveStock, releaseStock, InsufficientStockError } from '../lib/inventory.js';
import { recordStockMovement } from '../lib/stockLedger.js';

type ReturnItemInput = {
  productId: string;
  batchId?: string;
  qty: number;
  rate: number;
  gstRate: number;
};

async function mapReturnItemsForStockist(
  tenantId: string,
  connectionId: string,
  body: {
    purchaseOrderId?: string;
    payableBillId?: string;
    items: ReturnItemInput[];
  },
) {
  const db = await getDb();
  const productMap = new Map<string, string>();
  let stockistOrderId: string | undefined;
  const catalogItems = await db.select({
    localProductId: stockistCatalogItems.localProductId,
    stockistProductId: stockistCatalogItems.stockistProductId,
  }).from(stockistCatalogItems).where(eq(stockistCatalogItems.connectionId, connectionId));

  for (const cat of catalogItems) {
    if (cat.localProductId) productMap.set(cat.localProductId, cat.stockistProductId);
  }

  if (body.purchaseOrderId) {
    const po = await db.query.pharmacyPurchaseOrders.findFirst({
      where: and(
        eq(pharmacyPurchaseOrders.id, body.purchaseOrderId),
        eq(pharmacyPurchaseOrders.tenantId, tenantId),
      ),
    });
    if (po?.externalOrderId) stockistOrderId = po.externalOrderId;

    const poItems = await db.select({
      stockistProductId: pharmacyPurchaseOrderItems.stockistProductId,
    }).from(pharmacyPurchaseOrderItems).where(eq(pharmacyPurchaseOrderItems.purchaseOrderId, body.purchaseOrderId));

    for (const poi of poItems) {
      for (const cat of catalogItems) {
        if (cat.stockistProductId === poi.stockistProductId && cat.localProductId) {
          productMap.set(cat.localProductId, poi.stockistProductId);
        }
      }
    }
  }

  if (body.payableBillId) {
    const bill = await db.query.payableBills.findFirst({
      where: and(
        eq(payableBills.id, body.payableBillId),
        eq(payableBills.tenantId, tenantId),
      ),
    });
    if (bill?.externalOrderId && !stockistOrderId) stockistOrderId = bill.externalOrderId;

    const billItems = await db.select({
      productId: payableBillItems.productId,
      externalProductId: payableBillItems.externalProductId,
    }).from(payableBillItems).where(eq(payableBillItems.billId, body.payableBillId));

    for (const bi of billItems) {
      if (bi.productId && bi.externalProductId) {
        productMap.set(bi.productId, bi.externalProductId);
      }
    }
  }

  const mappedItems: {
    productId: string;
    pharmacyProductId: string;
    pharmacyBatchId?: string;
    batchNumber?: string;
    qty: number;
    rate: number;
    gstRate: number;
  }[] = [];

  for (const item of body.items) {
    const stockistProductId = productMap.get(item.productId);
    if (!stockistProductId) {
      throw new Error(`Cannot map pharmacy product ${item.productId} to stockist catalog`);
    }

    let batchNumber: string | undefined;
    if (item.batchId) {
      const batch = await db.query.productBatches.findFirst({
        where: and(
          eq(productBatches.id, item.batchId),
          eq(productBatches.tenantId, tenantId),
        ),
      });
      batchNumber = batch?.batchNumber ?? undefined;
    }

    mappedItems.push({
      productId: stockistProductId,
      pharmacyProductId: item.productId,
      pharmacyBatchId: item.batchId,
      batchNumber,
      qty: item.qty,
      rate: item.rate,
      gstRate: item.gstRate,
    });
  }

  return { stockistOrderId, mappedItems };
}

export async function createStockistReturn(tenantId: string, userId: string, body: {
  stockistConnectionId: string;
  purchaseOrderId?: string;
  payableBillId?: string;
  returnDate: string;
  reason: 'expired' | 'damaged' | 'wrong_item' | 'cancelled' | 'other';
  notes?: string;
  items: {
    productId: string;
    batchId?: string;
    qty: number;
    rate: number;
    gstRate: number;
  }[];
}) {
  const db = await getDb();
  const conn = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.id, body.stockistConnectionId),
      eq(stockistConnections.pharmacyTenantId, tenantId),
      eq(stockistConnections.status, 'active'),
    ),
  });
  if (!conn) throw new Error('Stockist connection not found');
  if (!body.items.length) throw new Error('At least one return item is required');
  const isOtherReturnMode = !body.payableBillId && !body.purchaseOrderId;
  if (isOtherReturnMode && body.reason !== 'other') {
    throw new Error('Reason must be "other" when no purchase order or bill is linked');
  }

  for (const item of body.items) {
    let receivedQty = 0;
    if (body.payableBillId) {
      const billItems = await db.select({
        qty: payableBillItems.qty,
        productId: payableBillItems.productId,
      }).from(payableBillItems).where(eq(payableBillItems.billId, body.payableBillId));
      const match = billItems.find(b => b.productId === item.productId);
      if (match) receivedQty = match.qty;
    } else if (body.purchaseOrderId) {
      const catalogItems = await db.select({
        localProductId: stockistCatalogItems.localProductId,
        stockistProductId: stockistCatalogItems.stockistProductId,
      }).from(stockistCatalogItems).where(eq(stockistCatalogItems.connectionId, conn.id));
      const cat = catalogItems.find(c => c.localProductId === item.productId);
      if (cat) {
        const poItems = await db.select({
          stockistProductId: pharmacyPurchaseOrderItems.stockistProductId,
          receivedQty: pharmacyPurchaseOrderItems.receivedQty,
        }).from(pharmacyPurchaseOrderItems)
          .where(eq(pharmacyPurchaseOrderItems.purchaseOrderId, body.purchaseOrderId));
        const match = poItems.find(p => p.stockistProductId === cat.stockistProductId);
        if (match) receivedQty = match.receivedQty;
      }
    } else {
      if (!item.batchId) {
        throw new Error(`Batch is required for ad-hoc returns in "other" mode (product ${item.productId})`);
      }
      const batch = await db.query.productBatches.findFirst({
        where: and(
          eq(productBatches.id, item.batchId),
          eq(productBatches.productId, item.productId),
          eq(productBatches.tenantId, tenantId),
        ),
      });
      if (!batch) {
        throw new Error(`Batch ${item.batchId} not found for product ${item.productId}`);
      }
      receivedQty = batch.qtyOnHand;
    }
    if (receivedQty <= 0) {
      throw new Error(`No received quantity available to return for product ${item.productId}`);
    }

    let returnable = receivedQty;
    const priorReturns = await db.select({ qty: stockistReturnItems.qty })
      .from(stockistReturnItems)
      .innerJoin(stockistReturns, eq(stockistReturnItems.returnId, stockistReturns.id))
      .where(and(
        eq(stockistReturns.tenantId, tenantId),
        eq(stockistReturnItems.productId, item.productId),
        notInArray(stockistReturns.status, ['rejected', 'cancelled']),
        body.purchaseOrderId ? eq(stockistReturns.purchaseOrderId, body.purchaseOrderId) : undefined,
        body.payableBillId ? eq(stockistReturns.payableBillId, body.payableBillId) : undefined,
        item.batchId ? eq(stockistReturnItems.batchId, item.batchId) : undefined,
      ));
    const alreadyReturned = priorReturns.reduce((s, r) => s + r.qty, 0);
    returnable = receivedQty - alreadyReturned;

    if (item.qty > returnable) {
      throw new Error(`Return qty ${item.qty} exceeds returnable qty ${returnable} for product ${item.productId}`);
    }
  }

  let totalAmount = 0;
  for (const item of body.items) {
    const product = await db.query.products.findFirst({
      where: and(eq(products.id, item.productId), eq(products.tenantId, tenantId)),
    });
    if (!product) throw new Error(`Product ${item.productId} not found`);
    totalAmount += round2(item.rate * item.qty * (1 + item.gstRate / 100));
  }

  const returnNumber = await nextStockistReturnNumber(tenantId);

  const ret = await db.transaction(async (tx) => {
    const [row] = await tx.insert(stockistReturns).values({
      tenantId,
      stockistConnectionId: body.stockistConnectionId,
      purchaseOrderId: body.purchaseOrderId ?? null,
      payableBillId: body.payableBillId ?? null,
      returnNumber,
      returnDate: body.returnDate,
      reason: body.reason,
      notes: body.notes,
      totalAmount: round2(totalAmount).toString(),
      status: 'requested',
      createdBy: userId,
    }).returning();

    for (const item of body.items) {
      const lineTotal = round2(item.rate * item.qty * (1 + item.gstRate / 100));
      await tx.insert(stockistReturnItems).values({
        returnId: row.id,
        tenantId,
        productId: item.productId,
        batchId: item.batchId ?? null,
        qty: item.qty,
        rate: item.rate.toString(),
        gstRate: item.gstRate.toString(),
        lineTotal: lineTotal.toString(),
      });

      if (item.batchId) {
        const updated = await tx.update(productBatches).set({
          qtyOnHand: sql`${productBatches.qtyOnHand} - ${item.qty}`,
        }).where(and(
          eq(productBatches.id, item.batchId),
          eq(productBatches.tenantId, tenantId),
          eq(productBatches.productId, item.productId),
          sql`${productBatches.qtyOnHand} >= ${item.qty}`,
        )).returning({ id: productBatches.id });
        if (updated.length === 0) {
          throw new InsufficientStockError(item.productId, item.qty, 0);
        }
        await recordStockMovement({
          tenantId,
          batchId: item.batchId,
          productId: item.productId,
          delta: -item.qty,
          reason: 'transfer_out',
          refType: 'return',
          refId: row.id,
          refNumber: returnNumber,
          performedBy: userId,
        }, tx as any);
      } else {
        const consumed = await reserveStock(tenantId, item.productId, item.qty, tx as any, {
          reason: 'transfer_out',
          refType: 'return',
          refId: row.id,
          refNumber: returnNumber,
          performedBy: userId,
          asOfDate: body.returnDate,
        });
        if (consumed[0]?.batchId) {
          await tx.update(stockistReturnItems).set({ batchId: consumed[0].batchId }).where(and(
            eq(stockistReturnItems.returnId, row.id),
            eq(stockistReturnItems.productId, item.productId),
          ));
        }
      }
    }

    return row;
  });

  const { stockistOrderId, mappedItems } = await mapReturnItemsForStockist(tenantId, conn.id, body);

  await emitCrossTenantEvent(tenantId, conn.stockistTenantId, 'return.requested', {
    returnId: ret.id,
    returnNumber,
    connectionId: conn.id,
    orderId: stockistOrderId,
    purchaseOrderId: body.purchaseOrderId,
    payableBillId: body.payableBillId,
    reason: body.reason,
    items: mappedItems,
  });

  return getStockistReturnDetail(tenantId, ret.id);
}

export async function listStockistReturns(tenantId: string, params: {
  stockistConnectionId?: string; page?: number; pageSize?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;

  const where = and(
    eq(stockistReturns.tenantId, tenantId),
    params.stockistConnectionId ? eq(stockistReturns.stockistConnectionId, params.stockistConnectionId) : undefined,
  );

  const rows = await db.select({
    id: stockistReturns.id,
    returnNumber: stockistReturns.returnNumber,
    returnDate: stockistReturns.returnDate,
    reason: stockistReturns.reason,
    totalAmount: stockistReturns.totalAmount,
    status: stockistReturns.status,
    stockistConnectionId: stockistReturns.stockistConnectionId,
    createdAt: stockistReturns.createdAt,
  }).from(stockistReturns)
    .where(where)
    .orderBy(desc(stockistReturns.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(stockistReturns).where(where);
  return { data: rows, total: Number(total), page, pageSize, pages: Math.ceil(Number(total) / pageSize) };
}

export async function getStockistReturnDetail(tenantId: string, returnId: string) {
  const db = await getDb();
  const ret = await db.query.stockistReturns.findFirst({
    where: and(eq(stockistReturns.id, returnId), eq(stockistReturns.tenantId, tenantId)),
  });
  if (!ret) return null;

  const items = await db.select({
    id: stockistReturnItems.id,
    productId: stockistReturnItems.productId,
    productName: products.name,
    batchId: stockistReturnItems.batchId,
    batchNumber: productBatches.batchNumber,
    qty: stockistReturnItems.qty,
    rate: stockistReturnItems.rate,
    gstRate: stockistReturnItems.gstRate,
    lineTotal: stockistReturnItems.lineTotal,
  }).from(stockistReturnItems)
    .leftJoin(products, eq(stockistReturnItems.productId, products.id))
    .leftJoin(productBatches, eq(stockistReturnItems.batchId, productBatches.id))
    .where(eq(stockistReturnItems.returnId, returnId));

  return { ...ret, items };
}
