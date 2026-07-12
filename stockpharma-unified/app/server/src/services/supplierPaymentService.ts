import { getDb } from '../db/client.js';
import { supplierPayments, suppliers } from '../db/schema.js';
import { eq, and, desc, count } from 'drizzle-orm';
import { postEntry } from '../lib/ledger.js';
import { nextSupplierPaymentNumber } from '../lib/ids.js';
import { LEDGER_ACCOUNT_CODES } from '../../../shared/constants.js';

const METHOD_ACCOUNT: Record<string, string> = {
  cash: LEDGER_ACCOUNT_CODES.CASH,
  upi: LEDGER_ACCOUNT_CODES.UPI,
  bank: LEDGER_ACCOUNT_CODES.BANK,
  cheque: LEDGER_ACCOUNT_CODES.BANK,
};

export async function recordSupplierPayment(tenantId: string, userId: string, body: {
  supplierId: string;
  paymentDate: string;
  method: string;
  referenceNo?: string;
  amount: number;
  notes?: string;
}) {
  const db = await getDb();
  const supplier = await db.query.suppliers.findFirst({
    where: and(eq(suppliers.id, body.supplierId), eq(suppliers.tenantId, tenantId)),
  });
  if (!supplier) throw new Error('Supplier not found');

  const paymentNumber = await nextSupplierPaymentNumber(tenantId);
  const [payment] = await db.insert(supplierPayments).values({
    tenantId,
    supplierId: body.supplierId,
    paymentNumber,
    paymentDate: body.paymentDate,
    method: body.method as any,
    referenceNo: body.referenceNo,
    amount: body.amount.toString(),
    notes: body.notes,
    createdBy: userId,
  }).returning();

  const accountCode = METHOD_ACCOUNT[body.method] ?? LEDGER_ACCOUNT_CODES.CASH;
  await postEntry({
    tenantId,
    txnDate: body.paymentDate,
    refType: 'payment',
    refId: payment.id,
    narration: `Payment to ${supplier.name} | ${paymentNumber}`,
    createdBy: userId,
    lines: [
      { accountCode: LEDGER_ACCOUNT_CODES.SUNDRY_CREDITORS, partnerType: 'supplier', partnerId: body.supplierId, debit: body.amount },
      { accountCode, credit: body.amount },
    ],
  });

  return payment;
}

export async function listSupplierPayments(tenantId: string, params: { supplierId?: string; page?: number; pageSize?: number }) {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;

  const where = and(
    eq(supplierPayments.tenantId, tenantId),
    params.supplierId ? eq(supplierPayments.supplierId, params.supplierId) : undefined,
  );

  const rows = await db.select().from(supplierPayments)
    .where(where)
    .orderBy(desc(supplierPayments.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(supplierPayments).where(where);
  return { data: rows, total: Number(total), page, pageSize, pages: Math.ceil(Number(total) / pageSize) };
}
