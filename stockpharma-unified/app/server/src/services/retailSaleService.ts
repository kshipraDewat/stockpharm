import { getDb } from '../db/client.js';
import {
  retailSales, retailSaleItems, products, customers, users, productBatches,
} from '../db/schema.js';
import { eq, and, desc, count, ilike, or, gte, lte, sql } from 'drizzle-orm';
import { reserveStock, releaseStock, InsufficientStockError } from '../lib/inventory.js';
import { recordStockMovement } from '../lib/stockLedger.js';
import { computeGst, round2 } from '../lib/gst.js';
import { nextRetailSaleNumber } from '../lib/ids.js';
import { postEntry } from '../lib/ledger.js';
import { LEDGER_ACCOUNT_CODES } from '../../../shared/constants.js';
import { tenants } from '../db/schema.js';

const SCHEDULED_TYPES = new Set(['H', 'H1', 'X', 'NDPS']);

const METHOD_ACCOUNT: Record<string, string> = {
  cash: LEDGER_ACCOUNT_CODES.CASH,
  upi: LEDGER_ACCOUNT_CODES.UPI,
  card: LEDGER_ACCOUNT_CODES.BANK,
};

export type PaymentBreakdownLine = { method: 'cash' | 'upi' | 'card'; amount: number };

/** Parse legacy "Split payment: cash ₹100 + upi ₹200" from sale notes. */
function parseSplitPaymentNotes(notes: string | null | undefined): PaymentBreakdownLine[] | null {
  if (!notes) return null;
  const match = notes.match(/Split payment:\s*([^|]+)/);
  if (!match) return null;
  const parsed: PaymentBreakdownLine[] = [];
  for (const part of match[1].split(' + ')) {
    const m = part.trim().match(/^(cash|upi|card)\s+₹([\d.]+)$/i);
    if (m) parsed.push({ method: m[1].toLowerCase() as PaymentBreakdownLine['method'], amount: parseFloat(m[2]) });
  }
  return parsed.length > 0 ? parsed : null;
}

/** Resolve payment legs from JSON column, legacy notes, or single paymentMethod. */
export function parsePaymentBreakdown(sale: {
  paymentBreakdownJson?: string | null;
  notes?: string | null;
  paymentMethod?: string;
  total?: string | number;
}): PaymentBreakdownLine[] {
  if (sale.paymentBreakdownJson) {
    try {
      const parsed = JSON.parse(sale.paymentBreakdownJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((b: { method: string; amount: number | string }) => ({
          method: b.method.toLowerCase() as PaymentBreakdownLine['method'],
          amount: parseFloat(String(b.amount)),
        }));
      }
    } catch {
      // fall through to notes / paymentMethod
    }
  }
  const fromNotes = parseSplitPaymentNotes(sale.notes);
  if (fromNotes) return fromNotes;
  return [{ method: (sale.paymentMethod ?? 'cash') as PaymentBreakdownLine['method'], amount: parseFloat(String(sale.total ?? '0')) }];
}

function paymentDebitLines(
  breakdown: { method: string; amount: number }[],
  paymentMethod: string,
  total: number,
): { accountCode: string; debit: number }[] {
  if (breakdown.length > 0) {
    return breakdown.map(b => ({
      accountCode: METHOD_ACCOUNT[b.method] ?? LEDGER_ACCOUNT_CODES.CASH,
      debit: round2(b.amount),
    }));
  }
  return [{ accountCode: METHOD_ACCOUNT[paymentMethod] ?? LEDGER_ACCOUNT_CODES.CASH, debit: total }];
}

function paymentCreditLines(
  breakdown: { method: string; amount: number }[] | null,
  paymentMethod: string,
  total: number,
): { accountCode: string; credit: number }[] {
  if (breakdown && breakdown.length > 0) {
    return breakdown.map(b => ({
      accountCode: METHOD_ACCOUNT[b.method] ?? LEDGER_ACCOUNT_CODES.CASH,
      credit: round2(b.amount),
    }));
  }
  return [{ accountCode: METHOD_ACCOUNT[paymentMethod] ?? LEDGER_ACCOUNT_CODES.CASH, credit: total }];
}

export async function createRetailSale(tenantId: string, userId: string, body: {
  saleDate: string;
  customerId?: string;
  paymentMethod: 'cash' | 'upi' | 'card';
  amountReceived?: number;
  notes?: string;
  paymentBreakdown?: { method: 'cash' | 'upi' | 'card'; amount: number }[];
  rxNumber?: string;
  doctorName?: string;
  doctorRegNo?: string;
  patientName?: string;
  patientAge?: number;
  items: {
    productId: string;
    batchId?: string;
    qty: number;
    rate?: number;
    discountPercent?: number;
  }[];
}) {
  if (!body.items.length) throw new Error('Cart is empty');

  const db = await getDb();
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  const sellerState = tenant?.stateCode ?? '08';

  if (body.customerId) {
    const customer = await db.query.customers.findFirst({
      where: and(eq(customers.id, body.customerId), eq(customers.tenantId, tenantId)),
    });
    if (!customer) throw new Error('Customer not found');
  }

  // C26: enforce prescription capture when any line is a scheduled drug.
  const productRows = await db.select({
    id: products.id, scheduleType: products.scheduleType, name: products.name,
  }).from(products).where(and(
    eq(products.tenantId, tenantId),
    sql`${products.id} IN (${sql.join(body.items.map(i => sql`${i.productId}`), sql`, `)})`,
  ));
  const productMap = new Map(productRows.map(p => [p.id, p]));
  const scheduledItems = body.items
    .map(i => productMap.get(i.productId))
    .filter(p => p && SCHEDULED_TYPES.has(p.scheduleType ?? 'NONE'));
  if (scheduledItems.length > 0) {
    const missing: string[] = [];
    if (!body.rxNumber?.trim()) missing.push('prescription number');
    if (!body.doctorName?.trim()) missing.push('doctor name');
    if (!body.patientName?.trim()) missing.push('patient name');
    if (missing.length > 0) {
      throw new Error(`RX_REQUIRED:Prescription details (${missing.join(', ')}) are required for Schedule H/H1/X/NDPS drugs`);
    }
  }

  const saleNumber = await nextRetailSaleNumber(tenantId);

  const createdId = await db.transaction(async (tx) => {
    const [sale] = await tx.insert(retailSales).values({
      tenantId,
      saleNumber,
      saleDate: body.saleDate,
      customerId: body.customerId ?? null,
      paymentMethod: body.paymentMethod,
      status: 'completed',
      cashierId: userId,
      notes: body.notes,
      rxNumber: body.rxNumber,
      doctorName: body.doctorName,
      doctorRegNo: body.doctorRegNo,
      patientName: body.patientName,
      patientAge: body.patientAge,
      subtotal: '0',
      taxAmount: '0',
      discountAmount: '0',
      total: '0',
      amountReceived: '0',
      changeAmount: '0',
    }).returning();

    let totalSubtotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;
    const gstLines: { gstRate: number; lineSubtotal: number }[] = [];
    const reserved: { batchId: string; qty: number }[] = [];

    try {
      for (const item of body.items) {
        const product = await tx.query.products.findFirst({
          where: and(eq(products.id, item.productId), eq(products.tenantId, tenantId)),
        });
        if (!product) throw new Error(`Product ${item.productId} not found`);

        const rate = item.rate ?? parseFloat(product.saleRate);
        const discountPct = item.discountPercent ?? 0;
        const gstRate = parseFloat(product.gstRate);

        // M24: if the caller supplied an explicit batchId, honor it (so the UI
        // can override FEFO when needed). Otherwise let reserveStock pick FEFO.
        let consumed: { batchId: string; qty: number; rate: number; batchNumber: string; expiryDate: string }[];
        if (item.batchId) {
          const today = body.saleDate;
          const picked = await tx.query.productBatches.findFirst({
            where: and(
              eq(productBatches.id, item.batchId),
              eq(productBatches.tenantId, tenantId),
              eq(productBatches.productId, item.productId),
            ),
          });
          if (!picked) throw new Error(`BATCH_NOT_AVAILABLE:Batch not found for ${product.name}`);
          if (picked.expiryDate < today) throw new Error(`EXPIRED_BATCH:Selected batch for ${product.name} has expired`);
          const updated = await tx.update(productBatches).set({
            qtyOnHand: sql`${productBatches.qtyOnHand} - ${item.qty}`,
          }).where(and(
            eq(productBatches.id, picked.id),
            sql`${productBatches.qtyOnHand} >= ${item.qty}`,
          )).returning({ id: productBatches.id });
          if (updated.length === 0) {
            throw new InsufficientStockError(item.productId, item.qty, picked.qtyOnHand);
          }
          await recordStockMovement({
            tenantId,
            batchId: picked.id,
            productId: item.productId,
            delta: -item.qty,
            reason: 'sale',
            refType: 'sale',
            refId: sale.id,
            refNumber: saleNumber,
            performedBy: userId,
          }, tx as any);
          consumed = [{
            batchId: picked.id,
            qty: item.qty,
            rate: parseFloat(picked.saleRate),
            batchNumber: picked.batchNumber,
            expiryDate: picked.expiryDate,
          }];
        } else {
          consumed = await reserveStock(tenantId, item.productId, item.qty, tx, {
            refType: 'sale',
            refId: sale.id,
            refNumber: saleNumber,
            performedBy: userId,
            asOfDate: body.saleDate,
          });
        }
        if (!consumed.length) throw new InsufficientStockError(item.productId, item.qty, 0);

        for (const batch of consumed) {
          reserved.push({ batchId: batch.batchId, qty: batch.qty });
          const lineSubtotal = round2(rate * batch.qty * (1 - discountPct / 100));
          const lineTax = round2(lineSubtotal * gstRate / (100 + gstRate));
          const lineTotal = lineSubtotal;

          await tx.insert(retailSaleItems).values({
            saleId: sale.id,
            tenantId,
            productId: item.productId,
            batchId: batch.batchId,
            batchNumber: batch.batchNumber,
            expiryDate: batch.expiryDate,
            qty: batch.qty,
            rate: rate.toString(),
            gstRate: gstRate.toString(),
            discountPercent: discountPct.toString(),
            lineSubtotal: lineSubtotal.toString(),
            lineTax: lineTax.toString(),
            lineTotal: lineTotal.toString(),
          });

          totalSubtotal += lineSubtotal;
          totalTax += lineTax;
          totalDiscount += round2(rate * batch.qty * discountPct / 100);
          gstLines.push({ gstRate, lineSubtotal: lineSubtotal - lineTax });
        }
      }
    } catch (err) {
      for (const r of reserved) {
        await releaseStock(tenantId, r.batchId, r.qty, tx, {
          refType: 'sale',
          refId: sale.id,
          refNumber: saleNumber,
          reason: 'sale_void',
        });
      }
      throw err;
    }

    const total = round2(totalSubtotal);
    let amountReceived = body.amountReceived ?? total;
    let changeAmount = round2(Math.max(0, amountReceived - total));
    let saleNotes = body.notes ?? '';

    const breakdown = body.paymentBreakdown?.filter(b => b.amount > 0) ?? [];
    if (breakdown.length > 0) {
      const breakdownTotal = round2(breakdown.reduce((s, b) => s + b.amount, 0));
      if (Math.abs(breakdownTotal - total) > 0.02) {
        throw new Error(`SPLIT_MISMATCH:Split payments (${breakdownTotal}) must equal sale total (${total})`);
      }
      const parts = breakdown.map(b => `${b.method} ₹${b.amount}`).join(' + ');
      saleNotes = [saleNotes, `Split payment: ${parts}`].filter(Boolean).join(' | ');
      amountReceived = breakdownTotal;
      changeAmount = 0;
    }

    await tx.update(retailSales).set({
      subtotal: round2(totalSubtotal - totalTax).toString(),
      taxAmount: round2(totalTax).toString(),
      discountAmount: round2(totalDiscount).toString(),
      total: total.toString(),
      amountReceived: amountReceived.toString(),
      changeAmount: changeAmount.toString(),
      notes: saleNotes || null,
      paymentBreakdownJson: breakdown.length > 0 ? JSON.stringify(breakdown) : null,
    }).where(eq(retailSales.id, sale.id));

    const gst = computeGst(gstLines, sellerState, sellerState);
    const halfTax = round2(gst.totalTax / 2);
    const otherHalf = round2(gst.totalTax - halfTax);

    const debitLines = paymentDebitLines(breakdown, body.paymentMethod, total);

    await postEntry({
      tenantId,
      txnDate: body.saleDate,
      refType: 'order',
      refId: sale.id,
      narration: `Retail sale ${saleNumber}`,
      createdBy: userId,
      lines: [
        ...debitLines,
        { accountCode: LEDGER_ACCOUNT_CODES.SALES, credit: round2(total - gst.totalTax) },
        { accountCode: LEDGER_ACCOUNT_CODES.CGST_OUTPUT, credit: halfTax },
        { accountCode: LEDGER_ACCOUNT_CODES.SGST_OUTPUT, credit: otherHalf },
      ],
    }, tx as any);

    return sale.id;
  });
  return getRetailSaleDetail(tenantId, createdId);
}

export async function voidRetailSale(
  tenantId: string, saleId: string, userId: string, reason?: string,
  opts?: { voidDate?: string },
) {
  const db = await getDb();
  const sale = await db.query.retailSales.findFirst({
    where: and(eq(retailSales.id, saleId), eq(retailSales.tenantId, tenantId)),
  });
  if (!sale) throw new Error('Sale not found');
  if (sale.status === 'voided') throw new Error('Sale already voided');

  const { todayIST } = await import('../lib/businessDate.js');
  const today = opts?.voidDate ?? todayIST();
  if (sale.saleDate !== today) throw new Error('Only same-day sales can be voided');

  // M13/C20-style: wrap void in a tx and use a conditional status flip.
  await db.transaction(async (tx) => {
    const flipped = await tx.update(retailSales).set({
      status: 'voided',
      voidedAt: new Date(),
      voidedBy: userId,
      voidReason: reason ?? null,
    }).where(and(
      eq(retailSales.id, saleId),
      eq(retailSales.status, 'completed'),
    )).returning({ id: retailSales.id });
    if (flipped.length === 0) throw new Error('Sale already voided');

    const items = await tx.select().from(retailSaleItems).where(eq(retailSaleItems.saleId, saleId));
    for (const item of items) {
      await releaseStock(tenantId, item.batchId, item.qty, tx as any, {
        refType: 'sale',
        refId: saleId,
        refNumber: sale.saleNumber,
        reason: 'sale_void',
        productId: item.productId,
        performedBy: userId,
      });
    }

    const total = parseFloat(sale.total);
    const splitBreakdown = parsePaymentBreakdown(sale);
    const creditLines = paymentCreditLines(
      splitBreakdown.length > 1 ? splitBreakdown : null,
      sale.paymentMethod,
      total,
    );
    await postEntry({
      tenantId,
      txnDate: today,
      refType: 'order',
      refId: saleId,
      narration: `VOID: Retail sale ${sale.saleNumber}`,
      createdBy: userId,
      lines: [
        { accountCode: LEDGER_ACCOUNT_CODES.SALES, debit: parseFloat(sale.subtotal) },
        { accountCode: LEDGER_ACCOUNT_CODES.CGST_OUTPUT, debit: round2(parseFloat(sale.taxAmount) / 2) },
        { accountCode: LEDGER_ACCOUNT_CODES.SGST_OUTPUT, debit: round2(parseFloat(sale.taxAmount) / 2) },
        ...creditLines,
      ],
    }, tx as any);
  });

  return db.query.retailSales.findFirst({ where: eq(retailSales.id, saleId) });
}

export async function listRetailSales(tenantId: string, params: {
  search?: string; status?: string; dateFrom?: string; dateTo?: string;
  page?: number; pageSize?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;
  const searchPattern = params.search ? `%${params.search}%` : undefined;

  const where = and(
    eq(retailSales.tenantId, tenantId),
    params.status ? eq(retailSales.status, params.status as any) : undefined,
    params.dateFrom ? gte(retailSales.saleDate, params.dateFrom) : undefined,
    params.dateTo ? lte(retailSales.saleDate, params.dateTo) : undefined,
    searchPattern
      ? or(
          ilike(retailSales.saleNumber, searchPattern),
          ilike(customers.name, searchPattern),
        )
      : undefined,
  );

  const rows = await db.select({
    id: retailSales.id,
    saleNumber: retailSales.saleNumber,
    saleDate: retailSales.saleDate,
    total: retailSales.total,
    paymentMethod: retailSales.paymentMethod,
    status: retailSales.status,
    customerName: customers.name,
    cashierName: users.name,
    createdAt: retailSales.createdAt,
  }).from(retailSales)
    .leftJoin(customers, eq(retailSales.customerId, customers.id))
    .leftJoin(users, eq(retailSales.cashierId, users.id))
    .where(where)
    .orderBy(desc(retailSales.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(retailSales)
    .leftJoin(customers, eq(retailSales.customerId, customers.id))
    .where(where);

  return { data: rows, total: Number(total), page, pageSize, pages: Math.ceil(Number(total) / pageSize) };
}

export async function getRetailSaleDetail(tenantId: string, saleId: string) {
  const db = await getDb();
  const sale = await db.query.retailSales.findFirst({
    where: and(eq(retailSales.id, saleId), eq(retailSales.tenantId, tenantId)),
  });
  if (!sale) return null;

  const items = await db.select({
    id: retailSaleItems.id,
    productId: retailSaleItems.productId,
    productName: products.name,
    batchNumber: retailSaleItems.batchNumber,
    expiryDate: retailSaleItems.expiryDate,
    qty: retailSaleItems.qty,
    rate: retailSaleItems.rate,
    gstRate: retailSaleItems.gstRate,
    discountPercent: retailSaleItems.discountPercent,
    lineSubtotal: retailSaleItems.lineSubtotal,
    lineTax: retailSaleItems.lineTax,
    lineTotal: retailSaleItems.lineTotal,
  }).from(retailSaleItems)
    .leftJoin(products, eq(retailSaleItems.productId, products.id))
    .where(eq(retailSaleItems.saleId, saleId));

  const customer = sale.customerId
    ? await db.query.customers.findFirst({ where: eq(customers.id, sale.customerId) })
    : null;
  const cashier = sale.cashierId
    ? await db.query.users.findFirst({ where: eq(users.id, sale.cashierId) })
    : null;

  const paymentBreakdown = parsePaymentBreakdown(sale);

  return {
    ...sale,
    items,
    customer,
    customerName: customer?.name ?? null,
    cashierName: cashier?.name,
    paymentBreakdown,
  };
}

export async function getTodayRetailSalesTotal(tenantId: string): Promise<number> {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const rows = await db.select({ total: retailSales.total }).from(retailSales).where(and(
    eq(retailSales.tenantId, tenantId),
    eq(retailSales.saleDate, today),
    eq(retailSales.status, 'completed'),
  ));
  return round2(rows.reduce((s, r) => s + parseFloat(r.total), 0));
}
