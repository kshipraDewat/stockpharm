import { getDb, type DbClient } from '../db/client.js';
import {
  payablePayments, payablePaymentAllocations, payableBills, stockistConnections,
} from '../db/schema.js';
import { eq, and, desc, count, asc, ne, or, ilike, gte, lte, sql } from 'drizzle-orm';
import { postEntry } from '../lib/ledger.js';
import { nextPayablePaymentNumber } from '../lib/ids.js';
import { round2 } from '../lib/gst.js';
import { LEDGER_ACCOUNT_CODES } from '../../../shared/constants.js';
import { emitCrossTenantEvent } from '../lib/crossTenant.js';

const METHOD_ACCOUNT: Record<string, string> = {
  cash: LEDGER_ACCOUNT_CODES.CASH,
  upi: LEDGER_ACCOUNT_CODES.UPI,
  bank: LEDGER_ACCOUNT_CODES.BANK,
  cheque: LEDGER_ACCOUNT_CODES.BANK,
};

export async function recordPayablePayment(tenantId: string, userId: string, body: {
  stockistConnectionId: string;
  paymentDate: string;
  method: string;
  referenceNo?: string;
  amount: number;
  notes?: string;
  allocations?: { billId: string; amount: number }[];
}) {
  const db = await getDb();
  const conn = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.id, body.stockistConnectionId),
      eq(stockistConnections.pharmacyTenantId, tenantId),
    ),
  });
  if (!conn) throw new Error('Stockist connection not found');

  const ref = body.referenceNo?.trim();
  // M5: require reference for non-cash methods.
  if (body.method !== 'cash' && !ref) {
    throw new Error('REFERENCE_REQUIRED:Reference number is required for non-cash payments');
  }
  if (ref && body.method !== 'cash') {
    const dup = await db.query.payablePayments.findFirst({
      where: and(
        eq(payablePayments.tenantId, tenantId),
        eq(payablePayments.referenceNo, ref),
        ne(payablePayments.status, 'voided'),
      ),
    });
    if (dup) throw new Error(`DUPLICATE_REFERENCE:This reference is already recorded on payment ${dup.paymentNumber}`);
  }

  return db.transaction(async (tx) => {
    const paymentNumber = await nextPayablePaymentNumber(tenantId, tx as DbClient);
    let remaining = body.amount;
    let allocations = body.allocations ?? [];

    if (allocations.length === 0) {
      const unpaidBills = await tx.select().from(payableBills)
        .where(and(
          eq(payableBills.tenantId, tenantId),
          eq(payableBills.stockistConnectionId, body.stockistConnectionId),
        ))
        .orderBy(asc(payableBills.billDate));

      for (const b of unpaidBills) {
        if (remaining <= 0) break;
        if (b.status === 'paid') continue;
        const outstanding = round2(parseFloat(b.total) - parseFloat(b.paidAmount));
        if (outstanding <= 0) continue;
        const alloc = Math.min(remaining, outstanding);
        allocations.push({ billId: b.id, amount: alloc });
        remaining -= alloc;
      }
    } else {
      const totalAllocSum = allocations.reduce((s, a) => s + a.amount, 0);
      if (round2(totalAllocSum) > round2(body.amount)) {
        throw new Error('Sum of allocations exceeds payment amount');
      }
      remaining = round2(body.amount - totalAllocSum);
    }

    const [payment] = await tx.insert(payablePayments).values({
      tenantId,
      stockistConnectionId: body.stockistConnectionId,
      paymentNumber,
      paymentDate: body.paymentDate,
      method: body.method as any,
      referenceNo: body.referenceNo,
      amount: body.amount.toString(),
      unallocatedAmount: remaining.toString(),
      status: 'successful',
      notes: body.notes,
      createdBy: userId,
    }).returning();

    for (const alloc of allocations) {
      if (alloc.amount <= 0) continue;
      const updated = await tx.update(payableBills).set({
        paidAmount: sql`CAST(${payableBills.paidAmount} AS NUMERIC) + ${alloc.amount}`,
        status: sql`CASE
          WHEN CAST(${payableBills.paidAmount} AS NUMERIC) + ${alloc.amount} >= CAST(${payableBills.total} AS NUMERIC) THEN 'paid'
          WHEN CAST(${payableBills.paidAmount} AS NUMERIC) + ${alloc.amount} > 0 THEN 'partial'
          ELSE 'unpaid' END`,
      }).where(and(
        eq(payableBills.id, alloc.billId),
        eq(payableBills.tenantId, tenantId),
        eq(payableBills.stockistConnectionId, body.stockistConnectionId),
        sql`CAST(${payableBills.paidAmount} AS NUMERIC) + ${alloc.amount} <= CAST(${payableBills.total} AS NUMERIC)`,
      )).returning({ id: payableBills.id });
      if (updated.length === 0) {
        throw new Error(`Allocation exceeds outstanding amount for bill ${alloc.billId}`);
      }
      await tx.insert(payablePaymentAllocations).values({
        paymentId: payment.id,
        billId: alloc.billId,
        allocatedAmount: alloc.amount.toString(),
      });
    }

    const accountCode = METHOD_ACCOUNT[body.method] ?? LEDGER_ACCOUNT_CODES.CASH;
    await postEntry({
      tenantId,
      txnDate: body.paymentDate,
      refType: 'payment',
      refId: payment.id,
      narration: `Payment to stockist | ${paymentNumber}`,
      createdBy: userId,
      lines: [
        { accountCode: LEDGER_ACCOUNT_CODES.SUNDRY_CREDITORS, debit: body.amount },
        { accountCode, credit: body.amount },
      ],
    }, tx as any);

    const eventAllocations: { externalBillId: string; amount: number }[] = [];
    for (const alloc of allocations) {
      if (alloc.amount <= 0) continue;
      const bill = await tx.query.payableBills.findFirst({
        where: and(eq(payableBills.id, alloc.billId), eq(payableBills.tenantId, tenantId)),
      });
      if (bill?.externalBillId) {
        eventAllocations.push({ externalBillId: bill.externalBillId, amount: alloc.amount });
      }
    }

    if (eventAllocations.length > 0 && conn.status === 'active') {
      await emitCrossTenantEvent(tenantId, conn.stockistTenantId, 'payment.recorded', {
        connectionId: body.stockistConnectionId,
        paymentNumber,
        paymentDate: body.paymentDate,
        method: body.method,
        referenceNo: body.referenceNo,
        amount: body.amount,
        allocations: eventAllocations,
      }, tx as any);
    }

    return payment;
  });
}

export async function listPayablePayments(tenantId: string, params: {
  stockistConnectionId?: string;
  method?: string;
  status?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;

  const searchPattern = params.search ? `%${params.search}%` : undefined;

  // M32: full filter support — method, status, date range, search.
  const where = and(
    eq(payablePayments.tenantId, tenantId),
    params.stockistConnectionId ? eq(payablePayments.stockistConnectionId, params.stockistConnectionId) : undefined,
    params.method ? eq(payablePayments.method, params.method as any) : undefined,
    params.status ? eq(payablePayments.status, params.status as any) : undefined,
    params.from ? gte(payablePayments.paymentDate, params.from) : undefined,
    params.to ? lte(payablePayments.paymentDate, params.to) : undefined,
    searchPattern
      ? or(
          ilike(payablePayments.paymentNumber, searchPattern),
          ilike(payablePayments.referenceNo, searchPattern),
        )
      : undefined,
  );

  const rows = await db.select({
    id: payablePayments.id,
    paymentNumber: payablePayments.paymentNumber,
    paymentDate: payablePayments.paymentDate,
    method: payablePayments.method,
    amount: payablePayments.amount,
    unallocatedAmount: payablePayments.unallocatedAmount,
    status: payablePayments.status,
    stockistConnectionId: payablePayments.stockistConnectionId,
    referenceNo: payablePayments.referenceNo,
    createdAt: payablePayments.createdAt,
  }).from(payablePayments)
    .where(where)
    .orderBy(desc(payablePayments.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(payablePayments).where(where);
  return { data: rows, total: Number(total), page, pageSize, pages: Math.ceil(Number(total) / pageSize) };
}

export async function voidPayablePayment(tenantId: string, paymentId: string, userId: string) {
  const db = await getDb();
  const payment = await db.query.payablePayments.findFirst({
    where: and(eq(payablePayments.id, paymentId), eq(payablePayments.tenantId, tenantId)),
  });
  if (!payment) throw new Error('Payment not found');
  if (payment.status === 'voided') throw new Error('Payment already voided');

  return db.transaction(async (tx) => {
    const allocs = await tx.select().from(payablePaymentAllocations)
      .where(eq(payablePaymentAllocations.paymentId, paymentId));

    const eventAllocations: { externalBillId: string; amount: number }[] = [];
    for (const alloc of allocs) {
      const bill = await tx.query.payableBills.findFirst({
        where: and(eq(payableBills.id, alloc.billId), eq(payableBills.tenantId, tenantId)),
      });
      if (!bill) continue;
      if (bill.externalBillId) {
        eventAllocations.push({ externalBillId: bill.externalBillId, amount: parseFloat(alloc.allocatedAmount) });
      }
      const newPaid = Math.max(0, round2(parseFloat(bill.paidAmount) - parseFloat(alloc.allocatedAmount)));
      const billTotal = parseFloat(bill.total);
      const newStatus: 'unpaid' | 'partial' | 'paid' = newPaid >= billTotal ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
      await tx.update(payableBills).set({ paidAmount: newPaid.toString(), status: newStatus }).where(and(
        eq(payableBills.id, alloc.billId),
        eq(payableBills.tenantId, tenantId),
      ));
    }

    await tx.update(payablePayments).set({ status: 'voided' }).where(and(
      eq(payablePayments.id, paymentId),
      eq(payablePayments.tenantId, tenantId),
    ));

    if (eventAllocations.length > 0) {
      const conn = await tx.query.stockistConnections.findFirst({
        where: eq(stockistConnections.id, payment.stockistConnectionId),
      });
      if (conn?.status === 'active') {
        await emitCrossTenantEvent(tenantId, conn.stockistTenantId, 'payment.voided', {
          connectionId: payment.stockistConnectionId,
          paymentNumber: payment.paymentNumber,
          allocations: eventAllocations,
        }, tx as any);
      }
    }

    const amount = parseFloat(payment.amount);
    const accountCode = METHOD_ACCOUNT[payment.method] ?? LEDGER_ACCOUNT_CODES.CASH;
    await postEntry({
      tenantId,
      txnDate: new Date().toISOString().split('T')[0],
      refType: 'payment',
      refId: paymentId,
      narration: `VOID: Payable payment ${payment.paymentNumber}`,
      createdBy: userId,
      lines: [
        { accountCode, debit: amount },
        { accountCode: LEDGER_ACCOUNT_CODES.SUNDRY_CREDITORS, credit: amount },
      ],
    }, tx as any);

    return payment;
  });
}
