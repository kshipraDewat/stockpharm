import { getDb, type DbClient } from '../db/client.js';
import { ledgerAccounts, ledgerEntries, ledgerLines } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { LedgerRefType } from '../../../shared/types.js';

export interface LedgerLineInput {
  accountCode: string;
  partnerType?: 'pharmacy' | 'supplier' | null;
  partnerId?: string | null;
  debit?: number;
  credit?: number;
}

export interface PostEntryInput {
  tenantId: string;
  txnDate: string;
  refType: LedgerRefType;
  refId: string;
  narration: string;
  lines: LedgerLineInput[];
  createdBy?: string;
}

/**
 * C2: postEntry now accepts an optional `dbClient` so callers running inside a
 * `db.transaction(async tx => ...)` can pass `tx` and have the ledger writes
 * roll back atomically with the rest of the operation. Existing callers that
 * pass no client retain the previous behaviour.
 */
export async function postEntry(input: PostEntryInput, dbClient?: DbClient): Promise<string> {
  const db = dbClient ?? await getDb();

  const totalDebit = input.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = input.lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Ledger imbalance: debit ${totalDebit} ≠ credit ${totalCredit}`);
  }

  const accounts = await db
    .select({ id: ledgerAccounts.id, code: ledgerAccounts.code })
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.tenantId, input.tenantId));

  const codeMap = new Map(accounts.map(a => [a.code, a.id]));

  const [entry] = await db
    .insert(ledgerEntries)
    .values({
      tenantId: input.tenantId,
      txnDate: input.txnDate,
      refType: input.refType,
      refId: input.refId,
      narration: input.narration,
      createdBy: input.createdBy,
    })
    .returning({ id: ledgerEntries.id });

  await db.insert(ledgerLines).values(
    input.lines.map(l => {
      const accountId = codeMap.get(l.accountCode);
      if (!accountId) throw new Error(`Unknown ledger account code: ${l.accountCode}`);
      return {
        entryId: entry.id,
        tenantId: input.tenantId,
        accountId,
        partnerType: l.partnerType ?? null,
        partnerId: l.partnerId ?? null,
        debit: (l.debit ?? 0).toString(),
        credit: (l.credit ?? 0).toString(),
      };
    }),
  );

  return entry.id;
}

export async function seedLedgerAccounts(tenantId: string): Promise<void> {
  const db = await getDb();
  const accounts = [
    { code: 'CASH', name: 'Cash in Hand', type: 'asset' },
    { code: 'BANK', name: 'Bank Account', type: 'asset' },
    { code: 'UPI_SUSPENSE', name: 'UPI Suspense', type: 'asset' },
    { code: 'SUNDRY_DEBTORS', name: 'Sundry Debtors', type: 'asset' },
    { code: 'SUNDRY_CREDITORS', name: 'Sundry Creditors', type: 'liability' },
    { code: 'INVENTORY', name: 'Inventory', type: 'asset' },
    { code: 'GRN_CLEARING', name: 'GRN Clearing', type: 'liability' },
    { code: 'SALES', name: 'Sales', type: 'income' },
    { code: 'SALES_RETURNS', name: 'Sales Returns', type: 'expense' },
    { code: 'PURCHASES', name: 'Purchases', type: 'expense' },
    { code: 'CGST_OUTPUT', name: 'CGST Output', type: 'liability' },
    { code: 'SGST_OUTPUT', name: 'SGST Output', type: 'liability' },
    { code: 'IGST_OUTPUT', name: 'IGST Output', type: 'liability' },
    { code: 'CGST_INPUT', name: 'CGST Input', type: 'asset' },
    { code: 'SGST_INPUT', name: 'SGST Input', type: 'asset' },
    { code: 'IGST_INPUT', name: 'IGST Input', type: 'asset' },
  ] as const;

  for (const acc of accounts) {
    await db
      .insert(ledgerAccounts)
      .values({ tenantId, code: acc.code, name: acc.name, type: acc.type })
      .onConflictDoNothing();
  }
}
