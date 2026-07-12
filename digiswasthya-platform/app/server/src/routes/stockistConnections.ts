import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import {
  requestConnection,
  listConnectionsForStockist,
  listConnectionsForPharmacy,
  findPharmacyConnectionByStockistTenantId,
  approveConnection,
  rejectConnection,
  disconnectConnection,
  withdrawConnection,
  syncCatalogToConnection,
  getCatalogForConnection,
  mapCatalogLocalProduct,
} from '../services/connectionService.js';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const page = Number.parseInt((req.query.page as string) ?? '', 10);
    const pageSize = Number.parseInt((req.query.pageSize as string) ?? '', 10);
    const pagination = {
      status,
      page: Number.isFinite(page) ? page : undefined,
      pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    };

    const tenantType = req.user.tenantType;
    if (!tenantType) { res.status(400).json({ error: 'Tenant type missing on session' }); return; }
    if (tenantType === 'pharmacy') {
      const rows = await listConnectionsForPharmacy(req.user.tenantId, pagination);
      res.json(rows);
      return;
    }
    const rows = await listConnectionsForStockist(req.user.tenantId, pagination);
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q as string) ?? '';
    if (q.length < 2) { res.json({ data: [] }); return; }
    const { searchStockists } = await import('../services/connectionService.js');
    res.json({ data: await searchStockists(q) });
  } catch (e) { next(e); }
});

router.get('/by-stockist/:stockistTenantId', requireTenantType('pharmacy'), async (req, res, next) => {
  try {
    const row = await findPharmacyConnectionByStockistTenantId(
      req.user.tenantId,
      req.params.stockistTenantId,
    );
    if (!row) { res.status(404).json({ error: 'Connection not found' }); return; }
    res.json(row);
  } catch (e) { next(e); }
});

// M62: fetch a single connection by id (used by Detail / Public Profile so the
// pharmacy panel doesn't have to filter the paginated list).
router.get('/:id', async (req, res, next) => {
  try {
    const tenantType = req.user.tenantType;
    if (!tenantType) { res.status(400).json({ error: 'Tenant type missing on session' }); return; }
    const { getDb } = await import('../db/client.js');
    const { stockistConnections, tenants } = await import('../db/schema.js');
    const { and, eq } = await import('drizzle-orm');
    const db = await getDb();
    const filter = tenantType === 'pharmacy'
      ? and(eq(stockistConnections.id, req.params.id), eq(stockistConnections.pharmacyTenantId, req.user.tenantId))
      : and(eq(stockistConnections.id, req.params.id), eq(stockistConnections.stockistTenantId, req.user.tenantId));
    const row = await db.query.stockistConnections.findFirst({ where: filter });
    if (!row) { res.status(404).json({ error: 'Connection not found' }); return; }
    // hydrate the other side's name for the UI
    const otherTenantId = tenantType === 'pharmacy' ? row.stockistTenantId : row.pharmacyTenantId;
    const other = await db.query.tenants.findFirst({ where: eq(tenants.id, otherTenantId) });
    res.json({
      ...row,
      stockistName: tenantType === 'pharmacy' ? other?.businessName : undefined,
      stockistGstin: tenantType === 'pharmacy' ? other?.gstin : undefined,
      stockistPhone: tenantType === 'pharmacy' ? other?.phone : undefined,
      pharmacyName: tenantType === 'stockist' ? other?.businessName : undefined,
      pharmacyGstin: tenantType === 'stockist' ? other?.gstin : undefined,
      pharmacyPhone: tenantType === 'stockist' ? other?.phone : undefined,
      pharmacyDl: tenantType === 'stockist' ? other?.dlNumber : undefined,
    });
  } catch (e) { next(e); }
});

router.post('/request', requireTenantType('pharmacy'), requireRole('admin', 'pharmacist'), auditMiddleware('stockist_connection'), async (req, res, next) => {
  try {
    const body = z.object({
      inviteCode: z.string().optional(),
      stockistTenantId: z.string().uuid().optional(),
      gstin: z.string().optional(),
      note: z.string().optional(),
      expectedMonthlyVolume: z.number().int().positive().optional(),
      requestSource: z.enum(['discovery', 'invite_code', 'gstin_search']).optional(),
    }).parse(req.body);
    const result = await requestConnection(req.user.tenantId, body);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/:id/withdraw', requireTenantType('pharmacy'), requireRole('admin', 'pharmacist'), auditMiddleware('stockist_connection'), async (req, res, next) => {
  try {
    const result = await withdrawConnection(req.user.tenantId, req.params.id);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/:id/approve', requireTenantType('stockist'), requireRole('admin'), auditMiddleware('stockist_connection'), async (req, res, next) => {
  try {
    const body = z.object({
      creditLimit: z.number().nonnegative().optional(),
      paymentTermsDays: z.number().int().positive().optional(),
    }).parse(req.body);
    const result = await approveConnection(req.user.tenantId, req.params.id, body);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/:id/reject', requireTenantType('stockist'), requireRole('admin'), auditMiddleware('stockist_connection'), async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body);
    const result = await rejectConnection(req.user.tenantId, req.params.id, reason);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/:id/disconnect', requireTenantType('stockist'), requireRole('admin'), auditMiddleware('stockist_connection'), async (req, res, next) => {
  try {
    const result = await disconnectConnection(req.user.tenantId, req.params.id);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/:id/sync-catalog', requireTenantType('stockist'), requireRole('admin'), async (req, res, next) => {
  try {
    const result = await syncCatalogToConnection(req.params.id, req.user.tenantId);
    res.json(result);
  } catch (e) { next(e); }
});

// C15: pharmacy-side endpoint to refresh the catalog cache for an active connection
router.post('/:id/pull-catalog', requireTenantType('pharmacy'), requireRole('admin', 'pharmacist'), async (req, res, next) => {
  try {
    const { pullCatalogForPharmacy } = await import('../services/connectionService.js');
    const result = await pullCatalogForPharmacy(req.params.id, req.user.tenantId);
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id/catalog', async (req, res, next) => {
  try {
    const items = await getCatalogForConnection(req.params.id, req.user.tenantId);
    res.json({ data: items });
  } catch (e) { next(e); }
});

router.patch('/:id/catalog/:catalogItemId/map', requireTenantType('pharmacy'), requireRole('admin', 'pharmacist'), auditMiddleware('stockist_connection'), async (req, res, next) => {
  try {
    const body = z.object({ localProductId: z.string().uuid() }).parse(req.body);
    const result = await mapCatalogLocalProduct(req.user.tenantId, req.params.id, req.params.catalogItemId, body.localProductId);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
