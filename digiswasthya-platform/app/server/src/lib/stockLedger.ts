import { getDb, type DbClient } from '../db/client.js';
import { stockMovements } from '../db/schema.js';

/**
 * C24: write a row to `stock_movements` for every batch qty mutation. Callers
 * inside a `db.transaction(async tx => ...)` should pass `tx` so the movement
 * row rolls back with the rest of the operation.
 */
export interface StockMovementInput {
  tenantId: string;
  batchId: string | null;
  productId: string | null;
  delta: number;
  reason:
    | 'purchase_receive'
    | 'grn_receive'
    | 'sale'
    | 'sale_void'
    | 'return_restock'
    | 'adjustment'
    | 'transfer_in'
    | 'transfer_out'
    | 'write_off'
    | 'other';
  refType: 'purchase' | 'grn' | 'order' | 'sale' | 'return' | 'adjustment' | 'manual';
  refId?: string | null;
  refNumber?: string | null;
  notes?: string | null;
  performedBy?: string | null;
}

export async function recordStockMovement(
  input: StockMovementInput,
  dbClient?: DbClient,
): Promise<void> {
  if (input.delta === 0) return;
  const db = dbClient ?? (await getDb());
  await db.insert(stockMovements).values({
    tenantId: input.tenantId,
    batchId: input.batchId ?? null,
    productId: input.productId ?? null,
    delta: input.delta,
    reason: input.reason,
    refType: input.refType,
    refId: input.refId ?? null,
    refNumber: input.refNumber ?? null,
    notes: input.notes ?? null,
    performedBy: input.performedBy ?? null,
  });
}
