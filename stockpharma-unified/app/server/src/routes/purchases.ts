import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { auditMiddleware } from '../middleware/audit.js';
import { createPurchase, receivePurchase, listPurchases, setProductSaleRates } from '../services/purchaseService.js';
import { parseInvoiceWithAi } from '../services/aiParseService.js';
import { getDb } from '../db/client.js';
import { purchases, purchaseItems, products, suppliers, ledgerEntries, ledgerLines, ledgerAccounts } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { validateExpiryDate } from '../lib/expiry.js';
import { env } from '../env.js';
import multer from 'multer';

const router = Router();
router.use(authenticate, requireTenantType('stockist'));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/', async (req, res, next) => {
  try {
    const { supplierId, status, search, dateFrom, dateTo, page, pageSize } = req.query as Record<string, string>;
    const result = await listPurchases(req.user.tenantId, {
      supplierId, status, search, dateFrom, dateTo,
      page: parseInt(page ?? '1'), pageSize: parseInt(pageSize ?? '20'),
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const purchase = await db.query.purchases.findFirst({ where: and(eq(purchases.id, req.params.id), eq(purchases.tenantId, req.user.tenantId)) });
    if (!purchase) { res.status(404).json({ error: 'Purchase not found' }); return; }
    const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, purchase.supplierId) });
    const items = await db.select({
      id: purchaseItems.id, productId: purchaseItems.productId, batchNumber: purchaseItems.batchNumber,
      expiryDate: purchaseItems.expiryDate, qty: purchaseItems.qty, freeQty: purchaseItems.freeQty,
      mrp: purchaseItems.mrp, purchaseRate: purchaseItems.purchaseRate, gstRate: purchaseItems.gstRate,
      lineSubtotal: purchaseItems.lineSubtotal, lineTax: purchaseItems.lineTax, lineTotal: purchaseItems.lineTotal,
      productName: products.name,
    }).from(purchaseItems)
      .leftJoin(products, eq(purchaseItems.productId, products.id))
      .where(eq(purchaseItems.purchaseId, req.params.id));
    res.json({
      ...purchase,
      supplierName: supplier?.name,
      supplierStateCode: supplier?.stateCode,
      supplierGstin: supplier?.gstin,
      items,
    });
  } catch (e) { next(e); }
});

router.get('/:id/ledger', async (req, res, next) => {
  try {
    const db = await getDb();
    const purchase = await db.query.purchases.findFirst({
      where: and(eq(purchases.id, req.params.id), eq(purchases.tenantId, req.user.tenantId)),
    });
    if (!purchase) { res.status(404).json({ error: 'Purchase not found' }); return; }
    const entries = await db.select({
      id: ledgerEntries.id, txnDate: ledgerEntries.txnDate, narration: ledgerEntries.narration,
      accountCode: ledgerAccounts.code, debit: ledgerLines.debit, credit: ledgerLines.credit,
    }).from(ledgerEntries)
      .innerJoin(ledgerLines, eq(ledgerLines.entryId, ledgerEntries.id))
      .innerJoin(ledgerAccounts, eq(ledgerLines.accountId, ledgerAccounts.id))
      .where(and(
        eq(ledgerEntries.tenantId, req.user.tenantId),
        eq(ledgerEntries.refType, 'purchase'),
        eq(ledgerEntries.refId, req.params.id),
      ));
    res.json(entries);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'biller'), auditMiddleware('purchase'), async (req, res, next) => {
  try {
    const body = z.object({
      supplierId: z.string().uuid(),
      supplierInvoiceNo: z.string().optional(),
      invoiceDate: z.string().optional(),
      notes: z.string().optional(),
      invoiceFileUrl: z.string().optional(),
      items: z.array(z.object({
        productId: z.string().uuid().optional(),
        productName: z.string().min(2).optional(),
        category: z.string().optional(),
        batchNumber: z.string(),
        expiryDate: z.string(),
        qty: z.number().int().positive(),
        freeQty: z.number().int().default(0),
        mrp: z.number().positive(),
        purchaseRate: z.number().positive(),
        gstRate: z.number(),
      }).refine(i => i.productId || i.productName, { message: 'Each line needs productId or productName' })).min(1),
    }).parse(req.body);
    const normalizedItems = body.items.map(i => ({
      ...i,
      expiryDate: validateExpiryDate(i.expiryDate),
    }));
    const result = await createPurchase(req.user.tenantId, req.user.sub, { ...body, items: normalizedItems });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// AI parse — requires FEATURE_AI_PARSE=true and GEMINI_API_KEY
// IMPORTANT: this must be registered BEFORE /:id/receive to avoid Express matching 'parse' as :id
router.post('/sale-rates', requireRole('admin', 'biller'), auditMiddleware('product'), async (req, res, next) => {
  try {
    const body = z.object({
      rates: z.array(z.object({
        productId: z.string().uuid(),
        saleRate: z.number().positive(),
      })).min(1),
    }).parse(req.body);
    const result = await setProductSaleRates(req.user.tenantId, body.rates);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/parse', requireRole('admin', 'biller'), upload.single('file'), async (req, res, next) => {
  try {
    if (!env.FEATURE_AI_PARSE) {
      res.status(403).json({ error: 'AI parsing not enabled. Set FEATURE_AI_PARSE=true and GEMINI_API_KEY in .env' });
      return;
    }
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const result = await parseInvoiceWithAi(req.user.tenantId, req.file.buffer, req.file.mimetype);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/:id/receive', requireRole('admin', 'biller'), auditMiddleware('purchase'), async (req, res, next) => {
  try {
    const result = await receivePurchase(req.user.tenantId, req.params.id, req.user.sub);
    res.json(result);
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('admin', 'biller'), auditMiddleware('purchase'), async (req, res, next) => {
  try {
    const body = z.object({
      supplierId: z.string().uuid().optional(),
      supplierInvoiceNo: z.string().optional(),
      invoiceDate: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const db = await getDb();
    if (body.supplierId) {
      const supplier = await db.query.suppliers.findFirst({
        where: and(eq(suppliers.id, body.supplierId), eq(suppliers.tenantId, req.user.tenantId)),
      });
      if (!supplier) { res.status(400).json({ error: 'Supplier not found' }); return; }
    }
    const [row] = await db.update(purchases).set(body).where(and(eq(purchases.id, req.params.id), eq(purchases.tenantId, req.user.tenantId))).returning();
    if (!row) { res.status(404).json({ error: 'Purchase not found' }); return; }
    res.json(row);
  } catch (e) { next(e); }
});

export default router;
