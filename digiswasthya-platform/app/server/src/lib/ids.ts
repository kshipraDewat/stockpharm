import { getDb, type DbClient } from '../db/client.js';
import { orders, bills, payments, returns, purchases, supplierPayments, pharmacyPurchaseOrders, pharmacyGrns, retailSales, payablePayments, stockistReturns } from '../db/schema.js';
import { eq, like, and, count } from 'drizzle-orm';

function pad(n: number, width: number) {
  return String(n).padStart(width, '0');
}

function yearStr() {
  return new Date().getFullYear().toString();
}

export async function nextOrderNumber(tenantId: string, dbClient?: DbClient): Promise<string> {
  const db = dbClient ?? await getDb();
  const yr = yearStr();
  const prefix = `ORD-${yr}-`;
  const rows = await db.select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), like(orders.orderNumber, `${prefix}%`)));
  let max = 0;
  for (const r of rows) {
    const num = parseInt(r.orderNumber.slice(prefix.length), 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return `${prefix}${pad(max + 1, 4)}`;
}

export async function nextBillNumber(tenantId: string, dbClient?: DbClient): Promise<string> {
  const db = dbClient ?? await getDb();
  const yr = yearStr();
  const prefix = `INV-${yr}-`;
  const rows = await db.select({ c: count() }).from(bills)
    .where(eq(bills.tenantId, tenantId));
  const n = (rows[0]?.c ?? 0) + 1;
  return `${prefix}${pad(n, 4)}`;
}

export async function nextPaymentNumber(tenantId: string, dbClient?: DbClient): Promise<string> {
  const db = dbClient ?? await getDb();
  const rows = await db.select({ c: count() }).from(payments)
    .where(eq(payments.tenantId, tenantId));
  const n = (rows[0]?.c ?? 0) + 1;
  return `PAY-${pad(n, 5)}`;
}

export async function nextReturnNumber(tenantId: string): Promise<string> {
  const db = await getDb();
  const rows = await db.select({ c: count() }).from(returns)
    .where(eq(returns.tenantId, tenantId));
  const n = (rows[0]?.c ?? 0) + 1;
  return `RET-${pad(n, 4)}`;
}

export async function nextGrnNumber(tenantId: string): Promise<string> {
  const db = await getDb();
  const rows = await db.select({ c: count() }).from(purchases)
    .where(eq(purchases.tenantId, tenantId));
  const n = (rows[0]?.c ?? 0) + 1;
  return `GRN-${yearStr()}-${pad(n, 4)}`;
}

export async function nextSupplierPaymentNumber(tenantId: string): Promise<string> {
  const db = await getDb();
  const rows = await db.select({ c: count() }).from(supplierPayments)
    .where(eq(supplierPayments.tenantId, tenantId));
  const n = (rows[0]?.c ?? 0) + 1;
  return `SPAY-${pad(n, 5)}`;
}

export async function nextPharmacyPoNumber(tenantId: string): Promise<string> {
  const db = await getDb();
  const yr = yearStr();
  const prefix = `PO-${yr}-`;
  const rows = await db.select({ poNumber: pharmacyPurchaseOrders.poNumber })
    .from(pharmacyPurchaseOrders)
    .where(and(eq(pharmacyPurchaseOrders.tenantId, tenantId), like(pharmacyPurchaseOrders.poNumber, `${prefix}%`)));
  let max = 0;
  for (const r of rows) {
    const num = parseInt(r.poNumber.slice(prefix.length), 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return `${prefix}${pad(max + 1, 4)}`;
}

export async function nextPharmacyGrnNumber(tenantId: string, dbClient?: DbClient): Promise<string> {
  const db = dbClient ?? await getDb();
  const yr = yearStr();
  const prefix = `PGRN-${yr}-`;
  const rows = await db.select({ c: count() }).from(pharmacyGrns)
    .where(eq(pharmacyGrns.tenantId, tenantId));
  const n = (rows[0]?.c ?? 0) + 1;
  return `${prefix}${pad(n, 4)}`;
}

export async function nextRetailSaleNumber(tenantId: string): Promise<string> {
  const db = await getDb();
  const yr = yearStr();
  const prefix = `SALE-${yr}-`;
  const rows = await db.select({ c: count() }).from(retailSales)
    .where(eq(retailSales.tenantId, tenantId));
  const n = (rows[0]?.c ?? 0) + 1;
  return `${prefix}${pad(n, 4)}`;
}

export async function nextPayablePaymentNumber(tenantId: string, dbClient?: DbClient): Promise<string> {
  const db = dbClient ?? await getDb();
  const rows = await db.select({ c: count() }).from(payablePayments)
    .where(eq(payablePayments.tenantId, tenantId));
  const n = (rows[0]?.c ?? 0) + 1;
  return `PPAY-${pad(n, 5)}`;
}

export async function nextStockistReturnNumber(tenantId: string): Promise<string> {
  const db = await getDb();
  const rows = await db.select({ c: count() }).from(stockistReturns)
    .where(eq(stockistReturns.tenantId, tenantId));
  const n = (rows[0]?.c ?? 0) + 1;
  return `SRET-${pad(n, 4)}`;
}
