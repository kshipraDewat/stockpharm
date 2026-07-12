import { getDb, type DbClient } from '../db/client.js';
import { payments, paymentAllocations, bills, pharmacies } from '../db/schema.js';
import { eq, and, desc, count, asc, sql, ne, or, ilike } from 'drizzle-orm';
import { postEntry } from '../lib/ledger.js';
import { nextPaymentNumber } from '../lib/ids.js';
import { round2 } from '../lib/gst.js';
import { LEDGER_ACCOUNT_CODES } from '../../../shared/constants.js';

const METHOD_ACCOUNT: Record<string, string> = {
  cash: LEDGER_ACCOUNT_CODES.CASH,
  upi: LEDGER_ACCOUNT_CODES.UPI,
  bank: LEDGER_ACCOUNT_CODES.BANK,
  cheque: LEDGER_ACCOUNT_CODES.BANK,
};

export async function recordPayment(tenantId: string, userId: string | null, body: {
  pharmacyId: string; paymentDate: string; method: string;
  referenceNo?: string; amount: number; notes?: string;
  allocations?: { billId: string; amount: number }[];
}) {
  const db = await getDb();
  const pharmacy = await db.query.pharmacies.findFirst({ where: and(eq(pharmacies.id, body.pharmacyId), eq(pharmacies.tenantId, tenantId)) });
  if (!pharmacy) throw new Error('Pharmacy not found');

  const ref = body.referenceNo?.trim();
  // M5: require reference for non-cash methods
  if (body.method !== 'cash' && !ref) {
    throw new Error('REFERENCE_REQUIRED:Reference number is required for non-cash payments');
  }
  if (ref && body.method !== 'cash') {
    const dup = await db.query.payments.findFirst({
      where: and(
        eq(payments.tenantId, tenantId),
        eq(payments.referenceNo, ref),
        ne(payments.status, 'voided'),
      ),
    });
    if (dup) throw new Error(`DUPLICATE_REFERENCE:This reference is already recorded on payment ${dup.paymentNumber}`);
  }

  // M3: wrap the entire payment + allocations + ledger in a transaction so any
  // failure rolls everything back; use atomic conditional UPDATEs on bills.
  return await db.transaction(async (tx) => {
    const paymentNumber = await nextPaymentNumber(tenantId, tx as DbClient);
    let remaining = body.amount;

    let allocations = body.allocations ?? [];
    if (allocations.length === 0) {
      const unpaidBills = await tx.select().from(bills)
        .where(and(eq(bills.tenantId, tenantId), eq(bills.pharmacyId, body.pharmacyId)))
        .orderBy(asc(bills.billDate));
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

    const [payment] = await tx.insert(payments).values({
      tenantId, pharmacyId: body.pharmacyId, paymentNumber, paymentDate: body.paymentDate,
      method: body.method as any, referenceNo: body.referenceNo,
      amount: body.amount.toString(), unallocatedAmount: remaining.toString(),
      status: 'successful', notes: body.notes, createdBy: userId ?? null,
    }).returning();

    for (const alloc of allocations) {
      if (alloc.amount <= 0) continue;
      // M3: conditional update — only succeeds when paid_amount + alloc <= total.
      const updated = await tx.update(bills).set({
        paidAmount: sql`CAST(${bills.paidAmount} AS NUMERIC) + ${alloc.amount}`,
        status: sql`CASE
          WHEN CAST(${bills.paidAmount} AS NUMERIC) + ${alloc.amount} >= CAST(${bills.total} AS NUMERIC) THEN 'paid'
          WHEN CAST(${bills.paidAmount} AS NUMERIC) + ${alloc.amount} > 0 THEN 'partial'
          ELSE 'unpaid' END`,
      }).where(and(
        eq(bills.id, alloc.billId),
        eq(bills.tenantId, tenantId),
        eq(bills.pharmacyId, body.pharmacyId),
        sql`CAST(${bills.paidAmount} AS NUMERIC) + ${alloc.amount} <= CAST(${bills.total} AS NUMERIC)`,
      )).returning({ id: bills.id });
      if (updated.length === 0) {
        throw new Error(`Allocation exceeds outstanding amount for bill ${alloc.billId}`);
      }
      await tx.insert(paymentAllocations).values({
        paymentId: payment.id, billId: alloc.billId, allocatedAmount: alloc.amount.toString(),
      });
    }

    const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
    await tx.update(pharmacies).set({
      outstanding: sql`GREATEST(0, outstanding - ${totalAllocated})`,
    }).where(eq(pharmacies.id, body.pharmacyId));

    const accountCode = METHOD_ACCOUNT[body.method] ?? LEDGER_ACCOUNT_CODES.CASH;
    // C2: thread the transaction through postEntry so a ledger failure rolls
    // back the payment.
    await postEntry({
      tenantId, txnDate: body.paymentDate, refType: 'payment', refId: payment.id,
      narration: `Payment from ${pharmacy.name} | ${paymentNumber}`,
      createdBy: userId ?? undefined,
      lines: [
        { accountCode, debit: body.amount },
        { accountCode: LEDGER_ACCOUNT_CODES.SUNDRY_DEBTORS, partnerType: 'pharmacy', partnerId: body.pharmacyId, credit: body.amount },
      ],
    }, tx as any);

    return payment;
  });
}

export async function listPayments(tenantId: string, params: { pharmacyId?: string; search?: string; page?: number; pageSize?: number }) {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;

  const searchPattern = params.search ? `%${params.search}%` : undefined;
  const where = and(
    eq(payments.tenantId, tenantId),
    params.pharmacyId ? eq(payments.pharmacyId, params.pharmacyId) : undefined,
    searchPattern
      ? or(
          ilike(payments.paymentNumber, searchPattern),
          ilike(payments.referenceNo, searchPattern),
          ilike(pharmacies.name, searchPattern),
        )
      : undefined,
  );

  const rows = await db.select({
    id: payments.id, paymentNumber: payments.paymentNumber, paymentDate: payments.paymentDate,
    method: payments.method, amount: payments.amount, status: payments.status,
    pharmacyId: payments.pharmacyId, pharmacyName: pharmacies.name,
    referenceNo: payments.referenceNo, createdAt: payments.createdAt,
  }).from(payments)
    .leftJoin(pharmacies, eq(payments.pharmacyId, pharmacies.id))
    .where(where).orderBy(desc(payments.createdAt)).limit(pageSize).offset(offset);

  // me4: count query must join pharmacies whenever the search filter touches pharmacies.name
  const [{ total }] = await db.select({ total: count() }).from(payments)
    .leftJoin(pharmacies, eq(payments.pharmacyId, pharmacies.id))
    .where(where);
  return { data: rows, total: Number(total), page, pageSize, pages: Math.ceil(Number(total) / pageSize) };
}

export async function voidPayment(tenantId: string, paymentId: string, userId: string) {
  const db = await getDb();
  const payment = await db.query.payments.findFirst({ where: and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)) });
  if (!payment) throw new Error('Payment not found');
  if (payment.status === 'voided') throw new Error('Payment already voided');

  return db.transaction(async (tx) => {
    const allocs = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, paymentId));
    for (const alloc of allocs) {
      const bill = await tx.query.bills.findFirst({
        where: and(eq(bills.id, alloc.billId), eq(bills.tenantId, tenantId)),
      });
      if (!bill) continue;
      const newPaid = Math.max(0, round2(parseFloat(bill.paidAmount) - parseFloat(alloc.allocatedAmount)));
      const billTotal = parseFloat(bill.total);
      const newStatus: 'unpaid' | 'partial' | 'paid' = newPaid >= billTotal ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
      await tx.update(bills).set({ paidAmount: newPaid.toString(), status: newStatus }).where(and(
        eq(bills.id, alloc.billId),
        eq(bills.tenantId, tenantId),
      ));
    }

    const totalAllocated = allocs.reduce((s, a) => s + parseFloat(a.allocatedAmount), 0);
    await tx.update(pharmacies).set({
      outstanding: sql`outstanding + ${totalAllocated}`,
    }).where(eq(pharmacies.id, payment.pharmacyId));

    await tx.update(payments).set({ status: 'voided' }).where(and(
      eq(payments.id, paymentId),
      eq(payments.tenantId, tenantId),
    ));

    const amount = parseFloat(payment.amount);
    const accountCode = METHOD_ACCOUNT[payment.method] ?? LEDGER_ACCOUNT_CODES.CASH;
    await postEntry({
      tenantId, txnDate: new Date().toISOString().split('T')[0], refType: 'payment', refId: paymentId,
      narration: `VOID: Payment ${payment.paymentNumber}`, createdBy: userId,
      lines: [
        { accountCode: LEDGER_ACCOUNT_CODES.SUNDRY_DEBTORS, partnerType: 'pharmacy', partnerId: payment.pharmacyId, debit: amount },
        { accountCode, credit: amount },
      ],
    }, tx as any);

    return payment;
  });
}
