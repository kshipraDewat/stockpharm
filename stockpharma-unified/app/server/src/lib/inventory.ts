import { getDb, type DbClient } from '../db/client.js';
import { productBatches } from '../db/schema.js';
import { eq, gt, sql, and, asc } from 'drizzle-orm';
import { recordStockMovement } from './stockLedger.js';

export class InsufficientStockError extends Error {
  constructor(public productId: string, public requested: number, public available: number) {
    super(`Insufficient stock for product ${productId}: requested ${requested}, available ${available}`);
    this.name = 'InsufficientStockError';
  }
}

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export interface ReserveStockOptions {
  refType?: 'order' | 'sale' | 'return';
  refId?: string;
  refNumber?: string;
  performedBy?: string;
  reason?: 'sale' | 'transfer_out';
  /** Stock eligibility date — defaults to today. Use order date for backdated sales. */
  asOfDate?: string;
}

export async function reserveStock(
  tenantId: string,
  productId: string,
  qty: number,
  dbClient?: DbClient,
  options?: ReserveStockOptions,
): Promise<{ batchId: string; qty: number; rate: number; batchNumber: string; expiryDate: string }[]> {
  const db = dbClient ?? await getDb();
  const today = options?.asOfDate ?? todayIsoDate();
  // C4 + M24: FEFO (expiry first, then received-at as tiebreaker)
  const batches = await db
    .select()
    .from(productBatches)
    .where(
      and(
        eq(productBatches.tenantId, tenantId),
        eq(productBatches.productId, productId),
        gt(productBatches.qtyOnHand, 0),
        gt(productBatches.expiryDate, today),
      ),
    )
    .orderBy(asc(productBatches.expiryDate), asc(productBatches.receivedAt));

  const totalAvailable = batches.reduce((s, b) => s + b.qtyOnHand, 0);
  if (totalAvailable < qty) throw new InsufficientStockError(productId, qty, totalAvailable);

  const consumed: { batchId: string; qty: number; rate: number; batchNumber: string; expiryDate: string }[] = [];
  let remaining = qty;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, batch.qtyOnHand);
    // C4: atomic conditional decrement — only proceed if the row still has enough
    const updated = await db
      .update(productBatches)
      .set({ qtyOnHand: sql`${productBatches.qtyOnHand} - ${take}` })
      .where(and(
        eq(productBatches.id, batch.id),
        sql`${productBatches.qtyOnHand} >= ${take}`,
      ))
      .returning({ id: productBatches.id });
    if (updated.length === 0) {
      // Someone else consumed this batch — recurse with the remaining qty.
      const refill = await reserveStock(tenantId, productId, remaining, dbClient, options);
      consumed.push(...refill);
      return consumed;
    }
    // C24: log the consumption in stock_movements.
    await recordStockMovement({
      tenantId,
      batchId: batch.id,
      productId,
      delta: -take,
      reason: options?.reason ?? 'sale',
      refType: options?.refType ?? 'sale',
      refId: options?.refId ?? null,
      refNumber: options?.refNumber ?? null,
      performedBy: options?.performedBy ?? null,
    }, dbClient);
    consumed.push({ batchId: batch.id, qty: take, rate: parseFloat(batch.saleRate), batchNumber: batch.batchNumber, expiryDate: batch.expiryDate });
    remaining -= take;
  }
  return consumed;
}

export interface ReleaseStockOptions {
  refType?: 'return' | 'sale' | 'order';
  refId?: string;
  refNumber?: string;
  reason?: 'return_restock' | 'sale_void';
  performedBy?: string;
  productId?: string;
}

export async function releaseStock(
  tenantId: string,
  batchId: string,
  qty: number,
  dbClient?: DbClient,
  options?: ReleaseStockOptions,
): Promise<void> {
  if (qty <= 0) return;
  const db = dbClient ?? await getDb();
  const updated = await db
    .update(productBatches)
    .set({ qtyOnHand: sql`${productBatches.qtyOnHand} + ${qty}` })
    .where(and(eq(productBatches.id, batchId), eq(productBatches.tenantId, tenantId)))
    .returning({ id: productBatches.id, productId: productBatches.productId });
  // me99: if the target batch doesn't exist, fail loudly so callers can react.
  if (updated.length === 0) {
    throw new Error(`Batch ${batchId} not found for tenant ${tenantId}`);
  }
  await recordStockMovement({
    tenantId,
    batchId,
    productId: options?.productId ?? updated[0].productId ?? null,
    delta: qty,
    reason: options?.reason ?? 'return_restock',
    refType: options?.refType ?? 'return',
    refId: options?.refId ?? null,
    refNumber: options?.refNumber ?? null,
    performedBy: options?.performedBy ?? null,
  }, dbClient);
}

export async function receiveStock(
  tenantId: string,
  productId: string,
  supplierId: string,
  sourcePurchaseId: string,
  batchNumber: string,
  expiryDate: string,
  mrp: number,
  purchaseRate: number,
  saleRate: number,
  qty: number,
  freeQty: number,
  options?: { refNumber?: string; performedBy?: string },
  dbClient?: DbClient,
): Promise<string> {
  const db = dbClient ?? await getDb();
  const totalQty = qty + freeQty;
  // C11: upsert by (tenant, product, batch_number, expiry).
  const existing = await db.query.productBatches.findFirst({
    where: and(
      eq(productBatches.tenantId, tenantId),
      eq(productBatches.productId, productId),
      eq(productBatches.batchNumber, batchNumber),
      eq(productBatches.expiryDate, expiryDate),
    ),
  });
  let batchId: string;
  if (existing) {
    await db.update(productBatches).set({
      qtyReceived: existing.qtyReceived + totalQty,
      qtyOnHand: existing.qtyOnHand + totalQty,
      mrp: mrp.toString(),
      purchaseRate: purchaseRate.toString(),
      saleRate: saleRate.toString(),
    }).where(eq(productBatches.id, existing.id));
    batchId = existing.id;
  } else {
    const [batch] = await db
      .insert(productBatches)
      .values({
        tenantId,
        productId,
        supplierId,
        sourcePurchaseId,
        batchNumber,
        expiryDate,
        mrp: mrp.toString(),
        purchaseRate: purchaseRate.toString(),
        saleRate: saleRate.toString(),
        qtyReceived: totalQty,
        qtyOnHand: totalQty,
      })
      .returning({ id: productBatches.id });
    batchId = batch.id;
  }
  await recordStockMovement({
    tenantId,
    batchId,
    productId,
    delta: totalQty,
    reason: 'purchase_receive',
    refType: 'purchase',
    refId: sourcePurchaseId,
    refNumber: options?.refNumber ?? null,
    performedBy: options?.performedBy ?? null,
  }, dbClient);
  return batchId;
}

export async function getProductStock(tenantId: string, productId: string): Promise<number> {
  const db = await getDb();
  const today = todayIsoDate();
  const rows = await db
    .select({ qty: productBatches.qtyOnHand })
    .from(productBatches)
    .where(and(
      eq(productBatches.tenantId, tenantId),
      eq(productBatches.productId, productId),
      gt(productBatches.expiryDate, today),
    ));
  return rows.reduce((s, r) => s + r.qty, 0);
}
