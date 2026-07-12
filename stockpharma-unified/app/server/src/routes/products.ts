import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole, sharedProductAdjust, sharedProductWrite } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { getDb } from '../db/client.js';
import { products, productBatches, stockistCatalogItems } from '../db/schema.js';
import { eq, and, count, sql, asc, or, ilike } from 'drizzle-orm';
import { pushCatalogToActiveConnections } from '../services/connectionService.js';
import { recordStockMovement } from '../lib/stockLedger.js';
import { autofillProductDetails } from '../services/aiProductService.js';
import { env } from '../env.js';

// C17: exclude expired batches from the displayed currentStock so the UI matches
// what reserveStock will actually consume.
// expiry_date is stored as ISO text — compare as text, not date
const stockSubquery = sql<number>`COALESCE((SELECT SUM(qty_on_hand) FROM product_batches WHERE product_id = ${products.id} AND tenant_id = ${products.tenantId} AND expiry_date > to_char(CURRENT_DATE, 'YYYY-MM-DD')), 0)`;

const router = Router();
router.use(authenticate);

// AI product autofill — infers metadata from a name (UNIFIED "product-info enrichment").
// Static path; declared before /:id handlers. Gated by FEATURE_AI_PARSE + GEMINI_API_KEY.
router.post('/autofill', sharedProductWrite, async (req, res, next) => {
  try {
    if (!env.FEATURE_AI_PARSE) {
      res.status(403).json({ error: 'AI features not enabled. Set FEATURE_AI_PARSE=true and GEMINI_API_KEY in .env' });
      return;
    }
    const { name } = z.object({ name: z.string().min(3) }).parse(req.body);
    const details = await autofillProductDetails(name);
    res.json(details);
  } catch (e) { next(e); }
});

const ProductSchema = z.object({
  name: z.string().min(2),
  genericName: z.string().optional(),
  manufacturer: z.string().optional(),
  category: z.string(),
  hsnCode: z.string().optional(),
  scheduleType: z.enum(['NONE', 'H', 'H1', 'X', 'NDPS']).default('NONE'),
  packSize: z.coerce.number().positive().default(1),
  baseUnit: z.string().default('Tab'),
  saleUnit: z.string().default('Strip'),
  convFactor: z.number().default(10),
  gstRate: z.number().min(0).max(28).default(12),
  mrp: z.number().positive(),
  purchaseRate: z.number().positive(),
  saleRate: z.number().positive(),
  minStockLevel: z.number().int().default(10),
  schemeBase: z.number().int().optional(),
  schemeBonus: z.number().int().optional(),
  isActive: z.boolean().default(true),
});

router.get('/', async (req, res, next) => {
  try {
    const { search, category, page = '1', pageSize = '20', export: exportFlag, includeInactive } = req.query as Record<string, string>;
    const db = await getDb();
    const pg = Math.max(1, parseInt(page));
    const requestedPs = parseInt(pageSize) || 20;
    const isExport = exportFlag === '1' || exportFlag === 'true';
    if (isExport && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    const ps = isExport ? Math.min(50000, requestedPs) : Math.min(100, requestedPs);
    const offset = (pg - 1) * ps;

    const searchPattern = search ? `%${search}%` : undefined;
    const where = and(
      eq(products.tenantId, req.user.tenantId),
      includeInactive === '1' || includeInactive === 'true' ? undefined : eq(products.isActive, true),
      category ? eq(products.category, category) : undefined,
      searchPattern
        ? or(ilike(products.name, searchPattern), ilike(products.genericName, searchPattern), ilike(products.hsnCode, searchPattern))
        : undefined,
    );

    const rows = await db.select({
      id: products.id, name: products.name, genericName: products.genericName,
      category: products.category, manufacturer: products.manufacturer,
      gstRate: products.gstRate, mrp: products.mrp, saleRate: products.saleRate,
      purchaseRate: products.purchaseRate, scheduleType: products.scheduleType,
      minStockLevel: products.minStockLevel, isActive: products.isActive,
      hsnCode: products.hsnCode, packSize: products.packSize,
      currentStock: stockSubquery,
    }).from(products).where(where).orderBy(products.name).limit(ps).offset(offset);

    const [{ total }] = await db.select({ total: count() }).from(products).where(where);
    const truncated = !isExport && Number(total) > ps;
    res.json({ data: rows, total: Number(total), page: pg, pageSize: ps, pages: Math.ceil(Number(total) / ps), truncated });
  } catch (e) { next(e); }
});

router.get('/export', requireRole('admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.select({
      id: products.id, name: products.name, genericName: products.genericName,
      category: products.category, manufacturer: products.manufacturer,
      gstRate: products.gstRate, mrp: products.mrp, saleRate: products.saleRate,
      purchaseRate: products.purchaseRate, scheduleType: products.scheduleType,
      minStockLevel: products.minStockLevel, isActive: products.isActive,
      hsnCode: products.hsnCode, packSize: products.packSize,
      currentStock: stockSubquery,
    }).from(products)
      .where(eq(products.tenantId, req.user.tenantId))
      .orderBy(products.name);
    res.json({ data: rows, total: rows.length });
  } catch (e) { next(e); }
});

router.get('/categories', async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.selectDistinct({ category: products.category })
      .from(products)
      .where(eq(products.tenantId, req.user.tenantId))
      .orderBy(products.category);
    const cats = rows.map(r => r.category).filter(Boolean);
    res.json(cats);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const product = await db.query.products.findFirst({
      where: and(eq(products.id, req.params.id), eq(products.tenantId, req.user.tenantId)),
    });
    if (!product) { res.status(404).json({ error: 'Product not found' }); return; }
    const [{ currentStock }] = await db.select({ currentStock: stockSubquery }).from(products)
      .where(and(eq(products.id, req.params.id), eq(products.tenantId, req.user.tenantId)));
    res.json({ ...product, currentStock: Number(currentStock ?? 0) });
  } catch (e) { next(e); }
});

router.get('/:id/batches', async (req, res, next) => {
  try {
    const db = await getDb();
    const batches = await db.select().from(productBatches)
      .where(and(eq(productBatches.productId, req.params.id), eq(productBatches.tenantId, req.user.tenantId)))
      .orderBy(asc(productBatches.expiryDate));
    res.json(batches);
  } catch (e) { next(e); }
});

router.post('/from-catalog/:catalogItemId', sharedProductWrite, auditMiddleware('product'), async (req, res, next) => {
  try {
    if (req.user.tenantType !== 'pharmacy') {
      res.status(403).json({ error: 'Only pharmacy tenants can create products from catalog' });
      return;
    }
    const db = await getDb();
    const catalogItem = await db.query.stockistCatalogItems.findFirst({
      where: and(
        eq(stockistCatalogItems.id, req.params.catalogItemId),
        eq(stockistCatalogItems.pharmacyTenantId, req.user.tenantId),
      ),
    });
    if (!catalogItem) { res.status(404).json({ error: 'Catalog item not found' }); return; }

    // me34: PTR (catalog.saleRate) is the pharmacy's COST. The pharmacy's
    // resale saleRate should default to MRP, not the cost basis.
    const [row] = await db.insert(products).values({
      tenantId: req.user.tenantId,
      name: catalogItem.name,
      genericName: catalogItem.genericName,
      manufacturer: catalogItem.manufacturer,
      category: catalogItem.category,
      hsnCode: catalogItem.hsnCode,
      scheduleType: catalogItem.scheduleType as any,
      packSize: catalogItem.packSize,
      gstRate: catalogItem.gstRate,
      mrp: catalogItem.mrp,
      purchaseRate: catalogItem.saleRate,
      saleRate: catalogItem.mrp ?? catalogItem.saleRate,
      isActive: true,
    }).returning();

    await db.update(stockistCatalogItems).set({ localProductId: row.id })
      .where(eq(stockistCatalogItems.id, catalogItem.id));

    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.post('/', sharedProductWrite, auditMiddleware('product'), async (req, res, next) => {
  try {
    const body = ProductSchema.parse(req.body);
    const db = await getDb();
    const [row] = await db.insert(products).values({
      tenantId: req.user.tenantId, ...body,
      packSize: String(body.packSize),
      gstRate: body.gstRate.toString(), mrp: body.mrp.toString(),
      purchaseRate: body.purchaseRate.toString(), saleRate: body.saleRate.toString(),
    }).returning();
    if (req.user.tenantType === 'stockist') {
      // me85: actually push the catalog to connected pharmacies & public listing.
      pushCatalogToActiveConnections(req.user.tenantId, [row.id]).catch(e => {
        console.error('[catalog push]', e);
      });
    }
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.patch('/:id', sharedProductWrite, auditMiddleware('product'), async (req, res, next) => {
  try {
    const body = ProductSchema.partial().parse(req.body);
    const db = await getDb();
    const updates: Record<string, unknown> = { ...body };
    if (body.gstRate !== undefined) updates.gstRate = body.gstRate.toString();
    if (body.mrp !== undefined) updates.mrp = body.mrp.toString();
    if (body.purchaseRate !== undefined) updates.purchaseRate = body.purchaseRate.toString();
    if (body.packSize !== undefined) updates.packSize = String(body.packSize);
    if (body.saleRate !== undefined) updates.saleRate = body.saleRate.toString();
    const [row] = await db.update(products).set(updates as any).where(and(eq(products.id, req.params.id), eq(products.tenantId, req.user.tenantId))).returning();
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    if (req.user.tenantType === 'stockist') {
      pushCatalogToActiveConnections(req.user.tenantId, [row.id]).catch(e => {
        console.error('[catalog push]', e);
      });
    }
    res.json(row);
  } catch (e) { next(e); }
});

const AdjustStockSchema = z.object({
  batchId: z.string().uuid(),
  deltaQty: z.number().int().refine(v => v !== 0, 'Delta must be non-zero'),
  reason: z.enum(['damaged', 'expired', 'cycle_count', 'lost', 'other']),
  notes: z.string().optional(),
});

router.post('/:id/adjust-stock', sharedProductAdjust, auditMiddleware('product'), async (req, res, next) => {
  try {
    const body = AdjustStockSchema.parse(req.body);
    const db = await getDb();

    const product = await db.query.products.findFirst({
      where: and(eq(products.id, req.params.id), eq(products.tenantId, req.user.tenantId)),
    });
    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const existingBatch = await db.query.productBatches.findFirst({
      where: and(
        eq(productBatches.id, body.batchId),
        eq(productBatches.productId, req.params.id),
        eq(productBatches.tenantId, req.user.tenantId),
      ),
    });
    if (!existingBatch) {
      res.status(404).json({ error: 'Batch not found. Use Purchase to add new batches.' });
      return;
    }
    if (!existingBatch.sourcePurchaseId && req.user.tenantType !== 'pharmacy') {
      res.status(400).json({ error: 'Cannot adjust batches without a source purchase' });
      return;
    }

    const priorOnHand = existingBatch.qtyOnHand;
    const newOnHand = priorOnHand + body.deltaQty;
    if (newOnHand < 0) {
      res.status(400).json({ error: 'Adjustment would result in negative stock' });
      return;
    }
    // C25: adjust-stock must never mutate qtyReceived (that field is the
    // supplier-receipt source-of-truth). Allow upward adjustments only up to
    // the historical receipt total.
    if (newOnHand > existingBatch.qtyReceived) {
      res.status(400).json({ error: 'On-hand cannot exceed historical received quantity. Record a new purchase to add stock.' });
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(productBatches)
        .set({ qtyOnHand: newOnHand })
        .where(eq(productBatches.id, existingBatch.id))
        .returning();

      await recordStockMovement({
        tenantId: req.user.tenantId,
        batchId: existingBatch.id,
        productId: existingBatch.productId,
        delta: body.deltaQty,
        reason: 'adjustment',
        refType: 'adjustment',
        refId: existingBatch.id,
        notes: `${body.reason}${body.notes ? `: ${body.notes}` : ''}`,
        performedBy: req.user.sub,
      }, tx as any);

      return row;
    });

    res.json({ ...updated, priorOnHand, deltaQty: body.deltaQty, reason: body.reason, notes: body.notes });
  } catch (e) { next(e); }
});

export default router;
