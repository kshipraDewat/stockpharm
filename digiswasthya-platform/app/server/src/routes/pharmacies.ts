import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { getDb } from '../db/client.js';
import { pharmacies, orders, bills, payments, returns, ledgerAccounts, ledgerEntries, ledgerLines } from '../db/schema.js';
import { eq, and, ilike, or, count, desc, asc } from 'drizzle-orm';
import { DEFAULT_CREDIT_LIMIT, LEDGER_ACCOUNT_CODES } from '../../../shared/constants.js';
import { getPharmacyExposure } from '../services/orderService.js';

const router = Router();
router.use(authenticate, requireTenantType('stockist'));

const PharmacySchema = z.object({
  name: z.string().min(2),
  contactPerson: z.string().min(1).default('Contact'),
  phone: z.string().min(7),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().min(1).default('Address not provided'),
  stateCode: z.string(),
  gstin: z.string().optional(),
  dlNumber: z.string().optional(),
  creditLimit: z.number().default(DEFAULT_CREDIT_LIMIT),
  paymentTermsDays: z.number().default(30),
  status: z.enum(['active', 'inactive', 'blocked']).default('active'),
  openingBalance: z.number().default(0),
});

router.get('/', async (req, res, next) => {
  try {
    const { search, status, page = '1', pageSize = '20', portalConnected } = req.query as Record<string, string>;
    const db = await getDb();
    const pg = Math.max(1, parseInt(page));
    const ps = Math.min(100, parseInt(pageSize));
    const offset = (pg - 1) * ps;

    const searchPattern = search ? `%${search}%` : undefined;
    const where = and(
      eq(pharmacies.tenantId, req.user.tenantId),
      status ? eq(pharmacies.status, status as any) : undefined,
      portalConnected === 'true' ? eq(pharmacies.portalConnected, true)
        : portalConnected === 'false' ? eq(pharmacies.portalConnected, false) : undefined,
      searchPattern
        ? or(
            ilike(pharmacies.name, searchPattern),
            ilike(pharmacies.phone, searchPattern),
            ilike(pharmacies.gstin, searchPattern),
            ilike(pharmacies.dlNumber, searchPattern),
          )
        : undefined,
    );

    const rows = await db.select().from(pharmacies).where(where)
      .orderBy(pharmacies.name).limit(ps).offset(offset);

    const [{ total }] = await db.select({ total: count() }).from(pharmacies).where(where);
    res.json({ data: rows, total: Number(total), page: pg, pageSize: ps, pages: Math.ceil(Number(total) / ps) });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const pharmacy = await db.query.pharmacies.findFirst({
      where: and(eq(pharmacies.id, req.params.id), eq(pharmacies.tenantId, req.user.tenantId)),
    });
    if (!pharmacy) { res.status(404).json({ error: 'Pharmacy not found' }); return; }
    res.json(pharmacy);
  } catch (e) { next(e); }
});

router.get('/:id/orders', async (req, res, next) => {
  try {
    const { page = '1', pageSize = '20' } = req.query as Record<string, string>;
    const db = await getDb();
    const pg = Math.max(1, parseInt(page));
    const ps = Math.min(100, parseInt(pageSize) || 20);
    const offset = (pg - 1) * ps;
    const where = and(eq(orders.pharmacyId, req.params.id), eq(orders.tenantId, req.user.tenantId));
    const rows = await db.select().from(orders).where(where)
      .orderBy(desc(orders.createdAt)).limit(ps).offset(offset);
    const [{ total }] = await db.select({ total: count() }).from(orders).where(where);
    res.json({ data: rows, total: Number(total), page: pg, pageSize: ps });
  } catch (e) { next(e); }
});

router.get('/:id/bills', async (req, res, next) => {
  try {
    const { unpaidOnly } = req.query as Record<string, string>;
    const db = await getDb();
    const rows = await db.select().from(bills)
      .where(and(eq(bills.pharmacyId, req.params.id), eq(bills.tenantId, req.user.tenantId)))
      .orderBy(desc(bills.createdAt)).limit(100);
    const filtered = unpaidOnly === '1' || unpaidOnly === 'true'
      ? rows.filter(b => {
          const status = String(b.status ?? '').toLowerCase();
          return status !== 'paid' && status !== 'voided';
        })
      : rows;
    res.json(filtered);
  } catch (e) { next(e); }
});

router.get('/:id/outstanding-bills', async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(bills)
      .where(and(eq(bills.pharmacyId, req.params.id), eq(bills.tenantId, req.user.tenantId)))
      .orderBy(bills.billDate);
    const outstanding = rows.filter(b => {
      const status = String(b.status ?? '').toLowerCase();
      return status !== 'paid' && status !== 'voided';
    });
    res.json(outstanding);
  } catch (e) { next(e); }
});

router.get('/:id/credit-info', async (req, res, next) => {
  try {
    const db = await getDb();
    const pharmacy = await db.query.pharmacies.findFirst({
      where: and(eq(pharmacies.id, req.params.id), eq(pharmacies.tenantId, req.user.tenantId)),
    });
    if (!pharmacy) { res.status(404).json({ error: 'Pharmacy not found' }); return; }
    const creditLimit = pharmacy.creditLimit ? parseFloat(pharmacy.creditLimit) : 0;
    const creditUsed = await getPharmacyExposure(db, req.user.tenantId, req.params.id);
    res.json({
      creditLimit,
      creditUsed,
      creditAvailable: Math.max(0, creditLimit - creditUsed),
    });
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), auditMiddleware('pharmacy'), async (req, res, next) => {
  try {
    const body = PharmacySchema.parse(req.body);
    const db = await getDb();
    const [row] = await db.insert(pharmacies).values({ tenantId: req.user.tenantId, ...body, creditLimit: body.creditLimit.toString(), outstanding: '0', openingBalance: body.openingBalance.toString() }).returning();
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('admin'), auditMiddleware('pharmacy'), async (req, res, next) => {
  try {
    const body = PharmacySchema.partial().parse(req.body);
    const db = await getDb();
    const [row] = await db.update(pharmacies).set(body as any).where(and(eq(pharmacies.id, req.params.id), eq(pharmacies.tenantId, req.user.tenantId))).returning();
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(row);
  } catch (e) { next(e); }
});

router.get('/:id/returns', async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(returns)
      .where(and(eq(returns.pharmacyId, req.params.id), eq(returns.tenantId, req.user.tenantId)))
      .orderBy(desc(returns.createdAt)).limit(50);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/:id/ledger', async (req, res, next) => {
  try {
    const db = await getDb();
    const pharmacy = await db.query.pharmacies.findFirst({
      where: and(eq(pharmacies.id, req.params.id), eq(pharmacies.tenantId, req.user.tenantId)),
    });
    if (!pharmacy) { res.status(404).json({ error: 'Pharmacy not found' }); return; }

    const entries: Array<{
      id: string; date: string; type: string; reference: string;
      debit: number; credit: number; notes: string;
    }> = [];

    const openingBal = parseFloat(pharmacy.openingBalance?.toString() || '0');
    if (openingBal !== 0) {
      const openingDate = pharmacy.createdAt
        ? new Date(pharmacy.createdAt).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      entries.push({
        id: 'opening',
        date: openingDate,
        type: 'opening',
        reference: 'Opening Balance',
        debit: openingBal > 0 ? openingBal : 0,
        credit: openingBal < 0 ? Math.abs(openingBal) : 0,
        notes: openingBal < 0 ? 'Advance / credit balance' : 'Initial recorded balance',
      });
    }

    const debtorsAccount = await db.query.ledgerAccounts.findFirst({
      where: and(
        eq(ledgerAccounts.tenantId, req.user.tenantId),
        eq(ledgerAccounts.code, LEDGER_ACCOUNT_CODES.SUNDRY_DEBTORS),
      ),
    });

    if (debtorsAccount) {
      const partnerLines = await db.select({
        lineId: ledgerLines.id,
        debit: ledgerLines.debit,
        credit: ledgerLines.credit,
        txnDate: ledgerEntries.txnDate,
        refType: ledgerEntries.refType,
        refId: ledgerEntries.refId,
        narration: ledgerEntries.narration,
      })
        .from(ledgerLines)
        .innerJoin(ledgerEntries, eq(ledgerLines.entryId, ledgerEntries.id))
        .where(and(
          eq(ledgerLines.tenantId, req.user.tenantId),
          eq(ledgerLines.accountId, debtorsAccount.id),
          eq(ledgerLines.partnerType, 'pharmacy'),
          eq(ledgerLines.partnerId, req.params.id),
        ))
        .orderBy(asc(ledgerEntries.txnDate), asc(ledgerEntries.createdAt));

      for (const line of partnerLines) {
        const debit = parseFloat(line.debit?.toString() || '0');
        const credit = parseFloat(line.credit?.toString() || '0');
        entries.push({
          id: line.lineId,
          date: line.txnDate,
          type: line.refType,
          reference: line.narration.split('|').pop()?.trim() ?? line.refType,
          debit,
          credit,
          notes: line.narration,
        });
      }
    }

    entries.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      if (a.type === 'opening') return -1;
      if (b.type === 'opening') return 1;
      return 0;
    });

    let runningBalance = 0;
    const ledgerEntriesWithBalance = entries.map(e => {
      runningBalance += (e.debit - e.credit);
      return { ...e, balance: runningBalance };
    });

    const storedOutstanding = parseFloat(pharmacy.outstanding?.toString() || '0');
    const computedBalance = runningBalance;
    const discrepancy = round2(computedBalance - storedOutstanding);

    res.json({
      entries: ledgerEntriesWithBalance,
      storedOutstanding,
      computedBalance,
      discrepancy,
    });
  } catch (e) { next(e); }
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

router.post('/:id/reconcile-outstanding', requireRole('admin'), auditMiddleware('pharmacy'), async (req, res, next) => {
  try {
    const db = await getDb();
    const pharmacy = await db.query.pharmacies.findFirst({
      where: and(eq(pharmacies.id, req.params.id), eq(pharmacies.tenantId, req.user.tenantId)),
    });
    if (!pharmacy) { res.status(404).json({ error: 'Pharmacy not found' }); return; }

    let runningBalance = parseFloat(pharmacy.openingBalance?.toString() || '0');
    const debtorsAccount = await db.query.ledgerAccounts.findFirst({
      where: and(
        eq(ledgerAccounts.tenantId, req.user.tenantId),
        eq(ledgerAccounts.code, LEDGER_ACCOUNT_CODES.SUNDRY_DEBTORS),
      ),
    });
    if (debtorsAccount) {
      const partnerLines = await db.select({
        debit: ledgerLines.debit,
        credit: ledgerLines.credit,
      })
        .from(ledgerLines)
        .innerJoin(ledgerEntries, eq(ledgerLines.entryId, ledgerEntries.id))
        .where(and(
          eq(ledgerLines.tenantId, req.user.tenantId),
          eq(ledgerLines.accountId, debtorsAccount.id),
          eq(ledgerLines.partnerType, 'pharmacy'),
          eq(ledgerLines.partnerId, req.params.id),
        ));
      for (const line of partnerLines) {
        runningBalance += parseFloat(line.debit?.toString() || '0') - parseFloat(line.credit?.toString() || '0');
      }
    }

    const computedBalance = round2(runningBalance);
    const [updated] = await db.update(pharmacies).set({
      outstanding: computedBalance.toString(),
    }).where(eq(pharmacies.id, req.params.id)).returning();

    res.json({ pharmacy: updated, reconciledTo: computedBalance });
  } catch (e) { next(e); }
});

export default router;
