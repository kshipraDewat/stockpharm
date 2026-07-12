import { getDb, type DbClient } from '../db/client.js';
import { bills, billItems, orders, orderItems, pharmacies, products, productBatches, paymentAllocations, payments, stockistConnections } from '../db/schema.js';
import { eq, and, desc, count, or, ilike, lt, inArray, sql } from 'drizzle-orm';
import { computeGst, round2 } from '../lib/gst.js';
import { nextBillNumber } from '../lib/ids.js';
import { emitCrossTenantEvent } from '../lib/crossTenant.js';

export type GenerateBillOpts = { billDate?: string; dueDate?: string };

export async function generateBill(
  tenantId: string,
  orderId: string,
  userId: string | null,
  dbClient?: DbClient,
  opts?: GenerateBillOpts,
): Promise<typeof bills.$inferSelect> {
  if (!dbClient) {
    const outer = await getDb();
    return outer.transaction((tx) => generateBill(tenantId, orderId, userId, tx as DbClient, opts));
  }
  const db = dbClient;
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)),
  });
  if (!order) throw new Error('Order not found');

  // C6: idempotent — return any pre-existing bill for the order.
  const existingBill = await db.query.bills.findFirst({ where: eq(bills.orderId, orderId) });
  if (existingBill) return existingBill;

  const pharmacy = await db.query.pharmacies.findFirst({ where: eq(pharmacies.id, order.pharmacyId) });
  const tenant = await db.query.tenants.findFirst({ where: eq((await import('../db/schema.js')).tenants.id, tenantId) });
  const sellerState = tenant?.stateCode ?? '08';
  const buyerState = pharmacy?.stateCode ?? '08';

  const items = await db.select({
    id: orderItems.id, productId: orderItems.productId, batchId: orderItems.batchId,
    qty: orderItems.qty, freeQty: orderItems.freeQty, rate: orderItems.rate,
    gstRate: orderItems.gstRate, lineSubtotal: orderItems.lineSubtotal,
    productName: products.name, hsnCode: products.hsnCode,
  }).from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));

  const gstResult = computeGst(
    items.map(i => ({ gstRate: parseFloat(i.gstRate), lineSubtotal: parseFloat(i.lineSubtotal) })),
    sellerState, buyerState,
  );

  const subtotal = items.reduce((s, i) => s + parseFloat(i.lineSubtotal), 0);
  const total = round2(subtotal + gstResult.totalTax);
  const billNumber = await nextBillNumber(tenantId, db);
  const billDate = opts?.billDate ?? new Date().toISOString().split('T')[0];
  const dueDate = opts?.dueDate ?? (() => {
    const base = opts?.billDate ? new Date(opts.billDate + 'T12:00:00') : new Date();
    base.setDate(base.getDate() + (pharmacy?.paymentTermsDays ?? 30));
    return base.toISOString().split('T')[0];
  })();

  let bill: typeof bills.$inferSelect;
  try {
    const [inserted] = await db.insert(bills).values({
      tenantId, orderId, pharmacyId: order.pharmacyId, billNumber, billDate, dueDate,
      isInterstate: order.isInterstate, placeOfSupply: order.placeOfSupply,
      subtotal: subtotal.toString(), cgst: gstResult.cgst.toString(),
      sgst: gstResult.sgst.toString(), igst: gstResult.igst.toString(),
      total: total.toString(), paidAmount: '0', status: 'unpaid',
      createdBy: userId ?? null as any,
    }).returning();
    bill = inserted;
  } catch (e: any) {
    // C6: defense-in-depth — if a parallel call already created the bill
    // (unique index on order_id once the migration is in place), short-circuit.
    if (e?.code === '23505') {
      const existing = await db.query.bills.findFirst({ where: eq(bills.orderId, orderId) });
      if (existing) return existing;
    }
    throw e;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const gLine = gstResult.perLine[i];
    const batch = item.batchId ? await db.query.productBatches.findFirst({ where: eq(productBatches.id, item.batchId) }) : null;
    await db.insert(billItems).values({
      billId: bill.id, tenantId, productId: item.productId, batchId: item.batchId ?? null,
      qty: item.qty, freeQty: item.freeQty, rate: item.rate, gstRate: item.gstRate,
      lineSubtotal: item.lineSubtotal, cgst: gLine.cgst.toString(),
      sgst: gLine.sgst.toString(), igst: gLine.igst.toString(),
      lineTotal: round2(parseFloat(item.lineSubtotal) + gLine.tax).toString(),
    });
  }

  if (order.source === 'pharmacy_submitted' && order.stockistConnectionId) {
    const conn = await db.query.stockistConnections.findFirst({
      where: eq(stockistConnections.id, order.stockistConnectionId),
    });
    if (conn) {
      const stockistTenant = await db.query.tenants.findFirst({
        where: eq((await import('../db/schema.js')).tenants.id, tenantId),
      });
      const billItemsData = await db.select({
        productId: billItems.productId,
        productName: products.name,
        batchNumber: productBatches.batchNumber,
        expiryDate: productBatches.expiryDate,
        qty: billItems.qty,
        freeQty: billItems.freeQty,
        rate: billItems.rate,
        gstRate: billItems.gstRate,
        lineSubtotal: billItems.lineSubtotal,
        cgst: billItems.cgst,
        sgst: billItems.sgst,
        igst: billItems.igst,
        lineTotal: billItems.lineTotal,
      }).from(billItems)
        .leftJoin(products, eq(billItems.productId, products.id))
        .leftJoin(productBatches, eq(billItems.batchId, productBatches.id))
        .where(eq(billItems.billId, bill.id));

      await emitCrossTenantEvent(tenantId, conn.pharmacyTenantId, 'bill.generated', {
        connectionId: order.stockistConnectionId,
        externalBillId: bill.id,
        externalOrderId: order.id,
        externalPharmacyOrderId: order.externalPharmacyOrderId,
        billNumber: bill.billNumber,
        stockistName: stockistTenant?.businessName ?? 'Stockist',
        billDate: bill.billDate,
        dueDate: bill.dueDate,
        isInterstate: bill.isInterstate,
        placeOfSupply: bill.placeOfSupply,
        subtotal: parseFloat(bill.subtotal),
        cgst: parseFloat(bill.cgst),
        sgst: parseFloat(bill.sgst),
        igst: parseFloat(bill.igst),
        total: parseFloat(bill.total),
        items: billItemsData.map(i => ({
          externalProductId: i.productId,
          productName: i.productName,
          batchNumber: i.batchNumber,
          expiryDate: i.expiryDate,
          qty: i.qty,
          freeQty: i.freeQty,
          rate: parseFloat(i.rate),
          gstRate: parseFloat(i.gstRate),
          lineSubtotal: parseFloat(i.lineSubtotal),
          cgst: parseFloat(i.cgst),
          sgst: parseFloat(i.sgst),
          igst: parseFloat(i.igst),
          lineTotal: parseFloat(i.lineTotal),
        })),
      }, dbClient);
    }
  }

  return bill;
}

/**
 * M1: `status` ∈ {unpaid, partial, paid}. Overdue is a derived flag.
 * We keep this function as a no-op shim so existing callers don't break; the
 * report-side filter (`b.ageDays > 0`) is the new source of truth for overdue.
 */
export async function markOverdueBills(_tenantId: string) {
  // no-op intentional: do not overwrite `partial` status.
}

/** True when an unpaid/partial bill's due date is in the past. */
export function isBillOverdue(b: { dueDate: string; status: string; paidAmount?: string | number; total: string | number }): boolean {
  if (b.status === 'paid' || b.status === 'voided') return false;
  return b.dueDate < new Date().toISOString().split('T')[0];
}

/** SQL filter: unpaid/partial bills past due date with outstanding balance. */
export function buildOverdueBillFilter(today = new Date().toISOString().split('T')[0]) {
  return and(
    inArray(bills.status, ['unpaid', 'partial']),
    lt(bills.dueDate, today),
    sql`CAST(${bills.total} AS NUMERIC) > CAST(${bills.paidAmount} AS NUMERIC)`,
  );
}

export async function listBills(tenantId: string, params: { search?: string; status?: string; page?: number; pageSize?: number }) {
  await markOverdueBills(tenantId);
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;

  const searchPattern = params.search ? `%${params.search}%` : undefined;
  const statusFilter = params.status === 'overdue'
    ? buildOverdueBillFilter()
    : params.status
      ? eq(bills.status, params.status as any)
      : undefined;
  const where = and(
    eq(bills.tenantId, tenantId),
    statusFilter,
    searchPattern
      ? or(ilike(bills.billNumber, searchPattern), ilike(pharmacies.name, searchPattern))
      : undefined,
  );

  const rows = await db.select({
    id: bills.id, billNumber: bills.billNumber, billDate: bills.billDate, dueDate: bills.dueDate,
    total: bills.total, paidAmount: bills.paidAmount, status: bills.status,
    pharmacyId: bills.pharmacyId, pharmacyName: pharmacies.name,
    cgst: bills.cgst, sgst: bills.sgst, igst: bills.igst, subtotal: bills.subtotal,
    createdAt: bills.createdAt,
  }).from(bills)
    .leftJoin(pharmacies, eq(bills.pharmacyId, pharmacies.id))
    .where(where).orderBy(desc(bills.createdAt)).limit(pageSize).offset(offset);

  const data = rows.map((r) => ({
    ...r,
    displayStatus: isBillOverdue(r) ? 'overdue' : r.status,
  }));

  const [{ total: totalCount }] = await db
    .select({ total: count() })
    .from(bills)
    .leftJoin(pharmacies, eq(bills.pharmacyId, pharmacies.id))
    .where(where);
  return { data, total: Number(totalCount), page, pageSize, pages: Math.ceil(Number(totalCount) / pageSize) };
}

export async function getBillDetail(tenantId: string, billId: string) {
  await markOverdueBills(tenantId);
  const db = await getDb();
  const bill = await db.query.bills.findFirst({ where: and(eq(bills.id, billId), eq(bills.tenantId, tenantId)) });
  if (!bill) return null;

  const items = await db.select({
    id: billItems.id, productId: billItems.productId, qty: billItems.qty, freeQty: billItems.freeQty,
    rate: billItems.rate, gstRate: billItems.gstRate, lineSubtotal: billItems.lineSubtotal,
    cgst: billItems.cgst, sgst: billItems.sgst, igst: billItems.igst, lineTotal: billItems.lineTotal,
    productName: products.name, hsnCode: products.hsnCode,
    batchNumber: productBatches.batchNumber, expiryDate: productBatches.expiryDate,
  }).from(billItems)
    .leftJoin(products, eq(billItems.productId, products.id))
    .leftJoin(productBatches, eq(billItems.batchId, productBatches.id))
    .where(eq(billItems.billId, billId));

  const pharmacy = await db.query.pharmacies.findFirst({ where: eq(pharmacies.id, bill.pharmacyId) });

  let orderStatus: string | undefined;
  if (bill.orderId) {
    const order = await db.query.orders.findFirst({ where: eq(orders.id, bill.orderId) });
    orderStatus = order?.status;
  }

  // M4: include payment status + reference so bill detail can show voided rows.
  const paymentRows = await db.select({
    id: payments.id, paymentNumber: payments.paymentNumber, paymentDate: payments.paymentDate,
    method: payments.method, referenceNo: payments.referenceNo, status: payments.status,
    allocatedAmount: paymentAllocations.allocatedAmount,
  }).from(paymentAllocations)
    .innerJoin(payments, eq(paymentAllocations.paymentId, payments.id))
    .where(and(eq(paymentAllocations.billId, billId), eq(payments.tenantId, tenantId)))
    .orderBy(desc(payments.paymentDate));

  return {
    ...bill,
    items,
    pharmacy,
    pharmacyStateCode: pharmacy?.stateCode,
    pharmacyName: pharmacy?.name,
    orderStatus,
    payments: paymentRows,
  };
}
