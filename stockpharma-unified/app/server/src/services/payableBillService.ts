import { getDb } from '../db/client.js';
import {
  payableBills, payableBillItems, payablePayments, payablePaymentAllocations,
  stockistCatalogItems,
} from '../db/schema.js';
import { eq, and, desc, count, ilike, lt, inArray, sql, gte, lte } from 'drizzle-orm';
import { round2 } from '../lib/gst.js';
import { findPurchaseOrderByExternalOrderId, findPurchaseOrderById } from './pharmacyPurchaseOrderService.js';
import { postEntry } from '../lib/ledger.js';
import { LEDGER_ACCOUNT_CODES } from '../../../shared/constants.js';

/**
 * M1: no-op. `partial` was being destructively overwritten with `overdue`,
 * which hid partial collections from the operator. The UI derives "overdue"
 * from `dueDate < today` now.
 */
export async function markOverduePayableBills(_tenantId: string) {
  // no-op intentional
}

/** SQL filter: unpaid/partial payable bills past due date with outstanding balance. */
export function buildOverduePayableBillFilter(today = new Date().toISOString().split('T')[0]) {
  return and(
    inArray(payableBills.status, ['unpaid', 'partial']),
    lt(payableBills.dueDate, today),
    sql`CAST(${payableBills.total} AS NUMERIC) > CAST(${payableBills.paidAmount} AS NUMERIC)`,
  );
}

export async function createPayableBillFromEvent(tenantId: string, payload: {
  connectionId: string;
  externalBillId: string;
  externalOrderId?: string;
  externalPharmacyOrderId?: string;
  billNumber: string;
  stockistName: string;
  billDate: string;
  dueDate: string;
  isInterstate?: boolean;
  placeOfSupply?: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  items: {
    externalProductId?: string;
    productName: string;
    batchNumber?: string;
    expiryDate?: string;
    qty: number;
    freeQty?: number;
    rate: number;
    gstRate: number;
    lineSubtotal: number;
    cgst: number;
    sgst: number;
    igst: number;
    lineTotal: number;
  }[];
}) {
  const db = await getDb();

  const existing = await db.query.payableBills.findFirst({
    where: and(
      eq(payableBills.tenantId, tenantId),
      eq(payableBills.externalBillId, payload.externalBillId),
    ),
  });
  if (existing) return existing;

  let purchaseOrderId: string | null = null;
  if (payload.externalPharmacyOrderId) {
    const po = await findPurchaseOrderById(tenantId, payload.externalPharmacyOrderId);
    purchaseOrderId = po?.id ?? null;
  } else if (payload.externalOrderId) {
    const po = await findPurchaseOrderByExternalOrderId(tenantId, payload.externalOrderId);
    purchaseOrderId = po?.id ?? null;
  }

  return db.transaction(async (tx) => {
    const [bill] = await tx.insert(payableBills).values({
      tenantId,
      stockistConnectionId: payload.connectionId,
      purchaseOrderId,
      externalBillId: payload.externalBillId,
      externalOrderId: payload.externalOrderId ?? null,
      billNumber: payload.billNumber,
      stockistName: payload.stockistName,
      billDate: payload.billDate,
      dueDate: payload.dueDate,
      isInterstate: payload.isInterstate ?? false,
      placeOfSupply: payload.placeOfSupply ?? '08',
      subtotal: payload.subtotal.toString(),
      cgst: payload.cgst.toString(),
      sgst: payload.sgst.toString(),
      igst: payload.igst.toString(),
      total: payload.total.toString(),
      paidAmount: '0',
      status: 'unpaid',
    }).returning();

    for (const item of payload.items) {
      let productId: string | null = null;
      if (item.externalProductId) {
        const catalogRow = await tx.query.stockistCatalogItems.findFirst({
          where: and(
            eq(stockistCatalogItems.connectionId, payload.connectionId),
            eq(stockistCatalogItems.stockistProductId, item.externalProductId),
          ),
        });
        productId = catalogRow?.localProductId ?? null;
      }

      await tx.insert(payableBillItems).values({
        billId: bill.id,
        tenantId,
        productId,
        externalProductId: item.externalProductId ?? null,
        productName: item.productName,
        batchNumber: item.batchNumber ?? null,
        expiryDate: item.expiryDate ?? null,
        qty: item.qty,
        freeQty: item.freeQty ?? 0,
        rate: item.rate.toString(),
        gstRate: item.gstRate.toString(),
        lineSubtotal: item.lineSubtotal.toString(),
        cgst: item.cgst.toString(),
        sgst: item.sgst.toString(),
        igst: item.igst.toString(),
        lineTotal: item.lineTotal.toString(),
      });
    }

    const subtotal = round2(payload.subtotal);
    const cgst = round2(payload.cgst);
    const sgst = round2(payload.sgst);
    const igst = round2(payload.igst);
    const total = round2(payload.total);
    const lines: { accountCode: string; debit?: number; credit?: number }[] = [
      { accountCode: LEDGER_ACCOUNT_CODES.GRN_CLEARING, debit: subtotal },
    ];
    if (cgst > 0) lines.push({ accountCode: LEDGER_ACCOUNT_CODES.CGST_INPUT, debit: cgst });
    if (sgst > 0) lines.push({ accountCode: LEDGER_ACCOUNT_CODES.SGST_INPUT, debit: sgst });
    if (igst > 0) lines.push({ accountCode: LEDGER_ACCOUNT_CODES.IGST_INPUT, debit: igst });
    lines.push({ accountCode: LEDGER_ACCOUNT_CODES.SUNDRY_CREDITORS, credit: total });
    await postEntry({
      tenantId,
      txnDate: payload.billDate,
      refType: 'bill',
      refId: bill.id,
      narration: `Payable bill ${payload.billNumber} from ${payload.stockistName}`,
      lines,
    }, tx as any);

    return bill;
  });
}

export async function listPayableBills(tenantId: string, params: {
  search?: string; status?: string; stockistConnectionId?: string;
  from?: string; to?: string;
  page?: number; pageSize?: number;
}) {
  await markOverduePayableBills(tenantId);
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;
  const searchPattern = params.search ? `%${params.search}%` : undefined;
  const statusFilter = params.status === 'overdue'
    ? buildOverduePayableBillFilter()
    : params.status
      ? eq(payableBills.status, params.status as any)
      : undefined;

  // M31: add date-range + stockist filters that the UI now passes through.
  const where = and(
    eq(payableBills.tenantId, tenantId),
    statusFilter,
    params.stockistConnectionId ? eq(payableBills.stockistConnectionId, params.stockistConnectionId) : undefined,
    params.from ? gte(payableBills.billDate, params.from) : undefined,
    params.to ? lte(payableBills.billDate, params.to) : undefined,
    searchPattern ? ilike(payableBills.billNumber, searchPattern) : undefined,
  );

  const rows = await db.select({
    id: payableBills.id,
    billNumber: payableBills.billNumber,
    billDate: payableBills.billDate,
    dueDate: payableBills.dueDate,
    total: payableBills.total,
    paidAmount: payableBills.paidAmount,
    // me81: ship outstanding from the server so the client doesn't have to subtract
    outstanding: sql<number>`GREATEST(0, CAST(${payableBills.total} AS NUMERIC) - CAST(${payableBills.paidAmount} AS NUMERIC))`,
    status: payableBills.status,
    stockistName: payableBills.stockistName,
    stockistConnectionId: payableBills.stockistConnectionId,
    createdAt: payableBills.createdAt,
  }).from(payableBills)
    .where(where)
    .orderBy(desc(payableBills.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(payableBills).where(where);
  return { data: rows, total: Number(total), page, pageSize, pages: Math.ceil(Number(total) / pageSize) };
}

export async function getPayableBillDetail(tenantId: string, billId: string) {
  await markOverduePayableBills(tenantId);
  const db = await getDb();
  const bill = await db.query.payableBills.findFirst({
    where: and(eq(payableBills.id, billId), eq(payableBills.tenantId, tenantId)),
  });
  if (!bill) return null;

  const items = await db.select().from(payableBillItems)
    .where(eq(payableBillItems.billId, billId));

  // M4: include payment status + reference so the UI can distinguish voided
  // rows. The outstanding figure already reflects voids (paidAmount is
  // decremented in voidPayablePayment); we just surface the metadata.
  const paymentRows = await db.select({
    id: payablePayments.id,
    paymentNumber: payablePayments.paymentNumber,
    paymentDate: payablePayments.paymentDate,
    method: payablePayments.method,
    referenceNo: payablePayments.referenceNo,
    status: payablePayments.status,
    allocatedAmount: payablePaymentAllocations.allocatedAmount,
  }).from(payablePaymentAllocations)
    .innerJoin(payablePayments, eq(payablePaymentAllocations.paymentId, payablePayments.id))
    .where(and(eq(payablePaymentAllocations.billId, billId), eq(payablePayments.tenantId, tenantId)))
    .orderBy(desc(payablePayments.paymentDate));

  const outstanding = round2(parseFloat(bill.total) - parseFloat(bill.paidAmount));

  return { ...bill, items, payments: paymentRows, outstanding };
}

export async function getPayablesOutstandingTotal(tenantId: string): Promise<number> {
  await markOverduePayableBills(tenantId);
  const db = await getDb();
  const rows = await db.select({
    total: payableBills.total,
    paidAmount: payableBills.paidAmount,
  }).from(payableBills).where(and(
    eq(payableBills.tenantId, tenantId),
    inArray(payableBills.status, ['unpaid', 'partial']),
    sql`CAST(${payableBills.total} AS NUMERIC) > CAST(${payableBills.paidAmount} AS NUMERIC)`,
  ));
  return round2(rows.reduce((s, r) => s + Math.max(0, parseFloat(r.total) - parseFloat(r.paidAmount)), 0));
}
