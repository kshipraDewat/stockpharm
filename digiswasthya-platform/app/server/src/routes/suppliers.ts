import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { auditMiddleware } from '../middleware/audit.js';
import { getDb } from '../db/client.js';
import { suppliers, purchases, purchaseItems, supplierPayments } from '../db/schema.js';
import { eq, and, count, desc, sum, sql, ilike } from 'drizzle-orm';

const router = Router();
router.use(authenticate, requireTenantType('stockist'));

const SupplierSchema = z.object({
  name: z.string().min(2),
  contactPerson: z.string().min(2),
  phone: z.string().min(7),
  email: z.string().email().optional(),
  address: z.string().min(5),
  stateCode: z.string(),
  gstin: z.string().optional(),
  dlNumber: z.string().optional(),
  paymentTermsDays: z.number().default(30),
  status: z.enum(['active', 'inactive', 'blocked']).default('active'),
});

// Helper to calculate supplier aggregations
async function getSupplierAggregations(db: any, supplierId: string, tenantId: string) {
  const purchasesData = await db.select({
    total: purchases.total,
  }).from(purchases)
    .where(and(eq(purchases.supplierId, supplierId), eq(purchases.tenantId, tenantId)));

  const totalPurchasesValue = purchasesData.reduce(
    (sum: number, p: { total: unknown }) => sum + parseFloat(p.total?.toString() || '0'),
    0,
  );

  const paymentsData = await db.select({ amount: supplierPayments.amount })
    .from(supplierPayments)
    .where(and(eq(supplierPayments.supplierId, supplierId), eq(supplierPayments.tenantId, tenantId)));

  const totalPayments = paymentsData.reduce(
    (sum: number, p: { amount: unknown }) => sum + parseFloat(p.amount?.toString() || '0'),
    0,
  );

  const outstandingBalance = Math.max(0, totalPurchasesValue - totalPayments);

  return { totalPurchasesValue, outstandingBalance, totalPayments };
}

router.get('/', async (req, res, next) => {
  try {
    const { search, status, page = '1', pageSize = '20' } = req.query as Record<string, string>;
    const db = await getDb();
    const pg = Math.max(1, parseInt(page));
    const ps = Math.min(100, parseInt(pageSize) || 20);
    const offset = (pg - 1) * ps;

    const where = and(
      eq(suppliers.tenantId, req.user.tenantId),
      status ? eq(suppliers.status, status as any) : undefined,
      search ? ilike(suppliers.name, `%${search}%`) : undefined,
    );

    const rows = await db.select().from(suppliers).where(where).orderBy(suppliers.name).limit(ps).offset(offset);

    const purchaseAgg = await db.select({
      supplierId: purchases.supplierId,
      totalPurchasesValue: sql<number>`COALESCE(SUM(CAST(${purchases.total} AS NUMERIC)), 0)`,
    }).from(purchases)
      .where(eq(purchases.tenantId, req.user.tenantId))
      .groupBy(purchases.supplierId);

    const paymentAgg = await db.select({
      supplierId: supplierPayments.supplierId,
      totalPayments: sql<number>`COALESCE(SUM(CAST(${supplierPayments.amount} AS NUMERIC)), 0)`,
    }).from(supplierPayments)
      .where(eq(supplierPayments.tenantId, req.user.tenantId))
      .groupBy(supplierPayments.supplierId);

    const purchaseMap = Object.fromEntries(purchaseAgg.map(r => [r.supplierId, Number(r.totalPurchasesValue)]));
    const paymentMap = Object.fromEntries(paymentAgg.map(r => [r.supplierId, Number(r.totalPayments)]));

    const rowsWithAgg = rows.map(r => {
      const totalPurchasesValue = purchaseMap[r.id] ?? 0;
      const totalPayments = paymentMap[r.id] ?? 0;
      return { ...r, totalPurchasesValue, totalPayments, outstandingBalance: Math.max(0, totalPurchasesValue - totalPayments) };
    });

    const [{ total }] = await db.select({ total: count() }).from(suppliers).where(where);
    res.json({ data: rowsWithAgg, total: Number(total), page: pg, pageSize: ps, pages: Math.ceil(Number(total) / ps) });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const supplier = await db.query.suppliers.findFirst({
      where: and(eq(suppliers.id, req.params.id), eq(suppliers.tenantId, req.user.tenantId)),
    });
    if (!supplier) { res.status(404).json({ error: 'Supplier not found' }); return; }

    const agg = await getSupplierAggregations(db, req.params.id, req.user.tenantId);
    res.json({ ...supplier, ...agg });
  } catch (e) { next(e); }
});

router.get('/:id/purchases', async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select().from(purchases)
      .where(and(eq(purchases.supplierId, req.params.id), eq(purchases.tenantId, req.user.tenantId)))
      .orderBy(desc(purchases.createdAt)).limit(50);
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'biller'), auditMiddleware('supplier'), async (req, res, next) => {
  try {
    const body = SupplierSchema.parse(req.body);
    const db = await getDb();
    const [row] = await db.insert(suppliers).values({ tenantId: req.user.tenantId, ...body }).returning();
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('admin', 'biller'), auditMiddleware('supplier'), async (req, res, next) => {
  try {
    const body = SupplierSchema.partial().parse(req.body);
    const db = await getDb();
    const [row] = await db.update(suppliers).set(body as any).where(and(eq(suppliers.id, req.params.id), eq(suppliers.tenantId, req.user.tenantId))).returning();
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(row);
  } catch (e) { next(e); }
});

router.get('/:id/ledger', async (req, res, next) => {
  try {
    const db = await getDb();
    const supplier = await db.query.suppliers.findFirst({
      where: and(eq(suppliers.id, req.params.id), eq(suppliers.tenantId, req.user.tenantId)),
    });
    if (!supplier) { res.status(404).json({ error: 'Supplier not found' }); return; }

    const purchasesData = await db.select().from(purchases)
      .where(and(eq(purchases.supplierId, req.params.id), eq(purchases.tenantId, req.user.tenantId)));

    const paymentsData = await db.select().from(supplierPayments)
      .where(and(eq(supplierPayments.supplierId, req.params.id), eq(supplierPayments.tenantId, req.user.tenantId)));

    const entries: any[] = [];

    for (const p of purchasesData) {
      entries.push({
        id: p.id,
        date: p.invoiceDate || (p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : ''),
        type: 'purchase',
        reference: p.supplierInvoiceNo || p.grnNumber || p.id.slice(0, 8),
        debit: parseFloat(p.total?.toString() || '0'),
        credit: 0,
        notes: p.notes || 'Purchase Invoice',
      });
    }

    for (const pay of paymentsData) {
      entries.push({
        id: pay.id,
        date: pay.paymentDate,
        type: 'payment',
        reference: pay.paymentNumber,
        debit: 0,
        credit: parseFloat(pay.amount?.toString() || '0'),
        notes: pay.notes || `Paid via ${pay.method}`,
      });
    }

    entries.sort((a, b) => a.date.localeCompare(b.date));

    let runningBalance = 0;
    const ledger = entries.map(e => {
      runningBalance += (e.debit - e.credit);
      return { ...e, balance: runningBalance };
    });

    res.json(ledger);
  } catch (e) { next(e); }
});

export default router;
