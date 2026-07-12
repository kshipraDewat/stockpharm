import { getDb } from '../db/client.js';
import { stockistConnections, tenants, pharmacies, products, productBatches, stockistCatalogItems } from '../db/schema.js';
import { eq, and, sql, count, notInArray, desc, inArray } from 'drizzle-orm';
import { emitCrossTenantEvent } from '../lib/crossTenant.js';
import { DEFAULT_CREDIT_LIMIT, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../shared/constants.js';

function parseTenantSettings(notificationsJson: string | null | undefined): Record<string, unknown> {
  if (!notificationsJson) return {};
  try { return JSON.parse(notificationsJson); } catch { return {}; }
}

async function getDefaultCreditLimit(stockistTenantId: string): Promise<number> {
  const db = await getDb();
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, stockistTenantId) });
  const settings = parseTenantSettings(tenant?.notificationsJson);
  const limit = Number(settings.defaultCreditLimit);
  return Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_CREDIT_LIMIT;
}

function normalizePagination(page?: number, pageSize?: number) {
  const parsedPage = Number.isFinite(page) ? Math.floor(Number(page)) : 1;
  const parsedPageSize = Number.isFinite(pageSize) ? Math.floor(Number(pageSize)) : DEFAULT_PAGE_SIZE;
  const safePage = parsedPage > 0 ? parsedPage : 1;
  const safePageSize = Math.min(MAX_PAGE_SIZE, parsedPageSize > 0 ? parsedPageSize : DEFAULT_PAGE_SIZE);
  return { page: safePage, pageSize: safePageSize, offset: (safePage - 1) * safePageSize };
}

/** PGlite leftJoin can drop joined tenant columns — hydrate in a second query. */
async function hydrateStockistTenants<T extends { stockistTenantId: string }>(rows: T[]) {
  if (rows.length === 0) return rows as (T & { stockistName: string | null; stockistGstin: string | null; stockistPhone: string | null })[];
  const db = await getDb();
  const ids = [...new Set(rows.map(r => r.stockistTenantId))];
  const tenantRows = await db.select({
    id: tenants.id,
    businessName: tenants.businessName,
    gstin: tenants.gstin,
    phone: tenants.phone,
  }).from(tenants).where(inArray(tenants.id, ids));
  const byId = new Map(tenantRows.map(t => [t.id, t]));
  return rows.map(r => {
    const t = byId.get(r.stockistTenantId);
    return {
      ...r,
      stockistName: t?.businessName ?? null,
      stockistGstin: t?.gstin ?? null,
      stockistPhone: t?.phone ?? null,
    };
  });
}

async function hydratePharmacyTenants<T extends { pharmacyTenantId: string }>(rows: T[]) {
  if (rows.length === 0) return rows as (T & { pharmacyName: string | null; pharmacyGstin: string | null; pharmacyPhone: string | null; pharmacyDl: string | null })[];
  const db = await getDb();
  const ids = [...new Set(rows.map(r => r.pharmacyTenantId))];
  const tenantRows = await db.select({
    id: tenants.id,
    businessName: tenants.businessName,
    gstin: tenants.gstin,
    phone: tenants.phone,
    dlNumber: tenants.dlNumber,
  }).from(tenants).where(inArray(tenants.id, ids));
  const byId = new Map(tenantRows.map(t => [t.id, t]));
  return rows.map(r => {
    const t = byId.get(r.pharmacyTenantId);
    return {
      ...r,
      pharmacyName: t?.businessName ?? null,
      pharmacyGstin: t?.gstin ?? null,
      pharmacyPhone: t?.phone ?? null,
      pharmacyDl: t?.dlNumber ?? null,
    };
  });
}

export async function findStockistByInviteCode(inviteCode: string) {
  const db = await getDb();
  return db.query.tenants.findFirst({
    where: and(
      eq(tenants.inviteCode, inviteCode.toUpperCase()),
      eq(tenants.tenantType, 'stockist'),
    ),
  });
}

export async function findStockistByGstin(gstin: string) {
  const db = await getDb();
  return db.query.tenants.findFirst({
    where: and(
      eq(tenants.gstin, gstin.toUpperCase()),
      eq(tenants.tenantType, 'stockist'),
    ),
  });
}

export async function searchStockists(query: string) {
  const db = await getDb();
  const q = `%${query.trim()}%`;
  return db.select({
    id: tenants.id,
    businessName: tenants.businessName,
    gstin: tenants.gstin,
    inviteCode: tenants.inviteCode,
  }).from(tenants).where(and(
    eq(tenants.tenantType, 'stockist'),
    sql`(${tenants.businessName} ILIKE ${q} OR ${tenants.gstin} ILIKE ${q})`,
  )).limit(10);
}

export async function requestConnection(
  pharmacyTenantId: string,
  opts: {
    inviteCode?: string;
    stockistTenantId?: string;
    gstin?: string;
    note?: string;
    expectedMonthlyVolume?: number;
    requestSource?: 'discovery' | 'invite_code' | 'gstin_search';
  },
) {
  const db = await getDb();
  let stockistTenantId = opts.stockistTenantId;
  let requestSource = opts.requestSource ?? (opts.inviteCode ? 'invite_code' : opts.gstin ? 'gstin_search' : 'discovery');

  if (opts.inviteCode) {
    const stockist = await findStockistByInviteCode(opts.inviteCode);
    if (!stockist) throw new Error('Invalid invite code');
    stockistTenantId = stockist.id;
    requestSource = 'invite_code';
  }

  if (opts.gstin && !stockistTenantId) {
    const stockist = await findStockistByGstin(opts.gstin);
    if (!stockist) throw new Error('No stockist found with this GSTIN');
    stockistTenantId = stockist.id;
    requestSource = 'gstin_search';
  }

  if (!stockistTenantId) throw new Error('Stockist not specified');
  if (stockistTenantId === pharmacyTenantId) throw new Error('Cannot connect to yourself');

  const stockistTenant = await db.query.tenants.findFirst({ where: eq(tenants.id, stockistTenantId) });
  if (!stockistTenant || stockistTenant.tenantType !== 'stockist') throw new Error('Invalid stockist');
  if (!stockistTenant.acceptingNewConnections) throw new Error('This stockist is not accepting new connections');

  const existing = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.stockistTenantId, stockistTenantId),
      eq(stockistConnections.pharmacyTenantId, pharmacyTenantId),
    ),
  });
  if (existing?.status === 'active') throw new Error('Already connected');
  if (existing?.status === 'pending') throw new Error('Connection request already pending');
  // me29: 7-day cooldown after a stockist rejection to prevent spam.
  if (existing?.status === 'rejected' && existing.updatedAt) {
    const ageMs = Date.now() - new Date(existing.updatedAt).getTime();
    const cooldownMs = 7 * 86_400_000;
    if (ageMs < cooldownMs) {
      const days = Math.ceil((cooldownMs - ageMs) / 86_400_000);
      throw new Error(`REQUEST_COOLDOWN:You can re-request this stockist in ${days} day(s)`);
    }
  }

  const pharmacyTenant = await db.query.tenants.findFirst({ where: eq(tenants.id, pharmacyTenantId) });
  if (!pharmacyTenant || pharmacyTenant.tenantType !== 'pharmacy') {
    throw new Error('Only pharmacy tenants can request connections');
  }

  const connectionFields = {
    status: 'pending' as const,
    rejectionReason: null,
    disconnectedAt: null,
    requestSource,
    requestNote: opts.note ?? null,
    expectedMonthlyVolume: opts.expectedMonthlyVolume ?? null,
  };

  if (existing) {
    const [conn] = await db.update(stockistConnections)
      .set(connectionFields)
      .where(eq(stockistConnections.id, existing.id))
      .returning();
    await emitCrossTenantEvent(pharmacyTenantId, stockistTenantId, 'connection.requested', {
      connectionId: conn.id,
      pharmacyName: pharmacyTenant.businessName,
      note: opts.note,
      expectedMonthlyVolume: opts.expectedMonthlyVolume,
      requestSource,
    });
    return conn;
  }

  const [conn] = await db.insert(stockistConnections).values({
    stockistTenantId,
    pharmacyTenantId,
    ...connectionFields,
  }).returning();

  await emitCrossTenantEvent(pharmacyTenantId, stockistTenantId, 'connection.requested', {
    connectionId: conn.id,
    pharmacyName: pharmacyTenant.businessName,
    note: opts.note,
    expectedMonthlyVolume: opts.expectedMonthlyVolume,
    requestSource,
  });

  return conn;
}

export async function listConnectionsForStockist(
  stockistTenantId: string,
  params: { status?: string; page?: number; pageSize?: number } = {},
) {
  const db = await getDb();
  const { page, pageSize, offset } = normalizePagination(params.page, params.pageSize);
  const where = and(
    eq(stockistConnections.stockistTenantId, stockistTenantId),
    params.status ? eq(stockistConnections.status, params.status as any) : undefined,
  );

  const baseRows = await db
    .select({
      id: stockistConnections.id,
      pharmacyTenantId: stockistConnections.pharmacyTenantId,
      linkedPharmacyId: stockistConnections.linkedPharmacyId,
      status: stockistConnections.status,
      creditLimit: stockistConnections.creditLimit,
      paymentTermsDays: stockistConnections.paymentTermsDays,
      rejectionReason: stockistConnections.rejectionReason,
      requestSource: stockistConnections.requestSource,
      requestNote: stockistConnections.requestNote,
      expectedMonthlyVolume: stockistConnections.expectedMonthlyVolume,
      connectedAt: stockistConnections.connectedAt,
      createdAt: stockistConnections.createdAt,
    })
    .from(stockistConnections)
    .where(where)
    .orderBy(desc(stockistConnections.createdAt))
    .limit(pageSize)
    .offset(offset);

  const rows = await hydratePharmacyTenants(baseRows);

  const [{ total }] = await db.select({ total: count() }).from(stockistConnections).where(where);
  const totalCount = Number(total);
  return { data: rows, total: totalCount, page, pageSize, pages: Math.ceil(totalCount / pageSize) };
}

export async function listConnectionsForPharmacy(
  pharmacyTenantId: string,
  params: { status?: string; page?: number; pageSize?: number } = {},
) {
  const db = await getDb();
  const { page, pageSize, offset } = normalizePagination(params.page, params.pageSize);
  const where = and(
    eq(stockistConnections.pharmacyTenantId, pharmacyTenantId),
    params.status ? eq(stockistConnections.status, params.status as any) : undefined,
  );

  const baseRows = await db
    .select({
      id: stockistConnections.id,
      stockistTenantId: stockistConnections.stockistTenantId,
      status: stockistConnections.status,
      creditLimit: stockistConnections.creditLimit,
      paymentTermsDays: stockistConnections.paymentTermsDays,
      rejectionReason: stockistConnections.rejectionReason,
      requestSource: stockistConnections.requestSource,
      requestNote: stockistConnections.requestNote,
      expectedMonthlyVolume: stockistConnections.expectedMonthlyVolume,
      connectedAt: stockistConnections.connectedAt,
      createdAt: stockistConnections.createdAt,
    })
    .from(stockistConnections)
    .where(where)
    .orderBy(desc(stockistConnections.createdAt))
    .limit(pageSize)
    .offset(offset);

  const rows = await hydrateStockistTenants(baseRows);

  const [{ total }] = await db.select({ total: count() }).from(stockistConnections).where(where);
  const totalCount = Number(total);
  return { data: rows, total: totalCount, page, pageSize, pages: Math.ceil(totalCount / pageSize) };
}

export async function findPharmacyConnectionByStockistTenantId(
  pharmacyTenantId: string,
  stockistTenantId: string,
) {
  const db = await getDb();
  const [row] = await db
    .select({
      id: stockistConnections.id,
      stockistTenantId: stockistConnections.stockistTenantId,
      status: stockistConnections.status,
      creditLimit: stockistConnections.creditLimit,
      paymentTermsDays: stockistConnections.paymentTermsDays,
      rejectionReason: stockistConnections.rejectionReason,
      requestSource: stockistConnections.requestSource,
      requestNote: stockistConnections.requestNote,
      expectedMonthlyVolume: stockistConnections.expectedMonthlyVolume,
      connectedAt: stockistConnections.connectedAt,
      createdAt: stockistConnections.createdAt,
    })
    .from(stockistConnections)
    .where(and(
      eq(stockistConnections.pharmacyTenantId, pharmacyTenantId),
      eq(stockistConnections.stockistTenantId, stockistTenantId),
    ))
    .limit(1);
  if (!row) return null;
  const [hydrated] = await hydrateStockistTenants([row]);
  return hydrated ?? null;
}

export async function approveConnection(
  stockistTenantId: string,
  connectionId: string,
  body: { creditLimit?: number; paymentTermsDays?: number },
) {
  const db = await getDb();
  const conn = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.id, connectionId),
      eq(stockistConnections.stockistTenantId, stockistTenantId),
    ),
  });
  if (!conn) throw new Error('Connection not found');
  if (conn.status !== 'pending') throw new Error('Connection is not pending');

  const pharmacyTenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, conn.pharmacyTenantId),
  });
  if (!pharmacyTenant) throw new Error('Pharmacy tenant not found');

  const creditLimit = body.creditLimit ?? await getDefaultCreditLimit(stockistTenantId);
  const paymentTermsDays = body.paymentTermsDays ?? 30;

  let linkedPharmacyId = conn.linkedPharmacyId;
  if (!linkedPharmacyId) {
    const existing = pharmacyTenant.gstin
      ? await db.query.pharmacies.findFirst({
          where: and(eq(pharmacies.tenantId, stockistTenantId), eq(pharmacies.gstin, pharmacyTenant.gstin)),
        })
      : null;

    if (existing) {
      linkedPharmacyId = existing.id;
      await db.update(pharmacies).set({
        portalConnected: true,
        pharmacyTenantId: conn.pharmacyTenantId,
        creditLimit: creditLimit.toString(),
        paymentTermsDays,
      }).where(eq(pharmacies.id, existing.id));
    } else {
      const [pharmacy] = await db.insert(pharmacies).values({
        tenantId: stockistTenantId,
        name: pharmacyTenant.businessName,
        contactPerson: pharmacyTenant.name,
        phone: pharmacyTenant.phone,
        email: pharmacyTenant.email,
        address: pharmacyTenant.addressJson ? JSON.parse(pharmacyTenant.addressJson).line1 ?? '—' : '—',
        stateCode: pharmacyTenant.stateCode,
        gstin: pharmacyTenant.gstin,
        // me35: don't print the literal string 'PENDING' on invoices. Leave the
        // DL nullable so downstream surfaces can flag missing DL explicitly.
        dlNumber: pharmacyTenant.dlNumber ?? null,
        creditLimit: creditLimit.toString(),
        paymentTermsDays,
        portalConnected: true,
        pharmacyTenantId: conn.pharmacyTenantId,
      }).returning();
      linkedPharmacyId = pharmacy.id;
    }
  }

  const [updated] = await db.update(stockistConnections).set({
    status: 'active',
    linkedPharmacyId,
    creditLimit: creditLimit.toString(),
    paymentTermsDays,
    connectedAt: new Date(),
  }).where(eq(stockistConnections.id, connectionId)).returning();

  await syncCatalogToConnection(connectionId, stockistTenantId);
  await emitCrossTenantEvent(stockistTenantId, conn.pharmacyTenantId, 'connection.approved', {
    connectionId,
    creditLimit,
    paymentTermsDays,
    linkedPharmacyId,
  });

  return updated;
}

export async function rejectConnection(stockistTenantId: string, connectionId: string, reason: string) {
  const db = await getDb();
  const conn = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.id, connectionId),
      eq(stockistConnections.stockistTenantId, stockistTenantId),
    ),
  });
  if (!conn) throw new Error('Connection not found');
  if (conn.status !== 'pending') throw new Error('Connection is not pending');

  const [updated] = await db.update(stockistConnections).set({
    status: 'rejected',
    rejectionReason: reason,
  }).where(eq(stockistConnections.id, connectionId)).returning();

  await emitCrossTenantEvent(stockistTenantId, conn.pharmacyTenantId, 'connection.rejected', {
    connectionId,
    reason,
  });

  return updated;
}

export async function withdrawConnection(pharmacyTenantId: string, connectionId: string) {
  const db = await getDb();
  const conn = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.id, connectionId),
      eq(stockistConnections.pharmacyTenantId, pharmacyTenantId),
    ),
  });
  if (!conn) throw new Error('Connection not found');
  if (conn.status !== 'pending') throw new Error('Only pending requests can be withdrawn');

  const [updated] = await db.update(stockistConnections).set({
    status: 'withdrawn',
  }).where(eq(stockistConnections.id, connectionId)).returning();

  await emitCrossTenantEvent(pharmacyTenantId, conn.stockistTenantId, 'connection.withdrawn', {
    connectionId,
  });

  return updated;
}

export async function disconnectConnection(tenantId: string, connectionId: string) {
  const db = await getDb();
  const conn = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.id, connectionId),
      sql`(${stockistConnections.stockistTenantId} = ${tenantId} OR ${stockistConnections.pharmacyTenantId} = ${tenantId})`,
    ),
  });
  if (!conn) throw new Error('Connection not found');
  if (conn.status !== 'active') throw new Error('Connection is not active');

  const [updated] = await db.update(stockistConnections).set({
    status: 'disconnected',
    disconnectedAt: new Date(),
  }).where(eq(stockistConnections.id, connectionId)).returning();

  if (conn.linkedPharmacyId) {
    await db.update(pharmacies).set({ portalConnected: false })
      .where(and(eq(pharmacies.id, conn.linkedPharmacyId), eq(pharmacies.tenantId, conn.stockistTenantId)));
  }

  const otherTenantId = tenantId === conn.stockistTenantId ? conn.pharmacyTenantId : conn.stockistTenantId;
  await emitCrossTenantEvent(tenantId, otherTenantId, 'connection.disconnected', { connectionId });

  return updated;
}

/**
 * Pharmacy-side: pull a fresh catalog snapshot for an active connection by triggering
 * the stockist-side sync (we share a DB so the writes propagate immediately).
 */
export async function pullCatalogForPharmacy(connectionId: string, pharmacyTenantId: string) {
  const db = await getDb();
  const conn = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.id, connectionId),
      eq(stockistConnections.pharmacyTenantId, pharmacyTenantId),
    ),
  });
  if (!conn || conn.status !== 'active') throw new Error('Active connection required');
  return syncCatalogToConnection(connectionId, conn.stockistTenantId);
}

export async function syncCatalogToConnection(connectionId: string, stockistTenantId: string) {
  const db = await getDb();
  const conn = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.id, connectionId),
      eq(stockistConnections.stockistTenantId, stockistTenantId),
    ),
  });
  if (!conn || conn.status !== 'active') throw new Error('Active connection required');

  const productRows = await db
    .select({
      id: products.id,
      name: products.name,
      genericName: products.genericName,
      manufacturer: products.manufacturer,
      category: products.category,
      hsnCode: products.hsnCode,
      scheduleType: products.scheduleType,
      packSize: products.packSize,
      gstRate: products.gstRate,
      mrp: products.mrp,
      saleRate: products.saleRate,
      schemeBase: products.schemeBase,
      schemeBonus: products.schemeBonus,
      minStockLevel: products.minStockLevel,
      stock: sql<number>`COALESCE(SUM(${productBatches.qtyOnHand}), 0)`.as('stock'),
    })
    .from(products)
    .leftJoin(productBatches, eq(productBatches.productId, products.id))
    .where(and(eq(products.tenantId, conn.stockistTenantId), eq(products.isActive, true)))
    .groupBy(products.id);

  const productIds = productRows.map(p => p.id);
  if (productIds.length > 0) {
    await db.delete(stockistCatalogItems).where(and(
      eq(stockistCatalogItems.connectionId, connectionId),
      notInArray(stockistCatalogItems.stockistProductId, productIds),
    ));
  } else {
    await db.delete(stockistCatalogItems).where(eq(stockistCatalogItems.connectionId, connectionId));
  }

  const now = new Date();
  for (const p of productRows) {
    const stock = Number(p.stock);
    const min = p.minStockLevel;
    const availabilityHint = stock === 0 ? 'out_of_stock' : stock < min ? 'low' : 'in_stock';

    const existing = await db.query.stockistCatalogItems.findFirst({
      where: and(
        eq(stockistCatalogItems.connectionId, connectionId),
        eq(stockistCatalogItems.stockistProductId, p.id),
      ),
    });

    if (existing) {
      await db.update(stockistCatalogItems).set({
        name: p.name,
        genericName: p.genericName,
        manufacturer: p.manufacturer,
        category: p.category,
        hsnCode: p.hsnCode,
        scheduleType: p.scheduleType,
        packSize: p.packSize,
        gstRate: p.gstRate,
        mrp: p.mrp,
        saleRate: p.saleRate,
        schemeBase: p.schemeBase,
        schemeBonus: p.schemeBonus,
        availabilityHint,
        syncedAt: now,
      }).where(eq(stockistCatalogItems.id, existing.id));
    } else {
      await db.insert(stockistCatalogItems).values({
        connectionId,
        stockistProductId: p.id,
        pharmacyTenantId: conn.pharmacyTenantId,
        name: p.name,
        genericName: p.genericName,
        manufacturer: p.manufacturer,
        category: p.category,
        hsnCode: p.hsnCode,
        scheduleType: p.scheduleType,
        packSize: p.packSize,
        gstRate: p.gstRate,
        mrp: p.mrp,
        saleRate: p.saleRate,
        schemeBase: p.schemeBase,
        schemeBonus: p.schemeBonus,
        availabilityHint,
        syncedAt: now,
      });
    }
  }

  return { synced: productRows.length };
}

export async function getCatalogForConnection(connectionId: string, pharmacyTenantId: string) {
  const db = await getDb();
  const conn = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.id, connectionId),
      eq(stockistConnections.pharmacyTenantId, pharmacyTenantId),
      eq(stockistConnections.status, 'active'),
    ),
  });
  if (!conn) throw new Error('Connection not found');

  return db.select().from(stockistCatalogItems)
    .where(eq(stockistCatalogItems.connectionId, connectionId));
}

export async function mapCatalogLocalProduct(
  pharmacyTenantId: string,
  connectionId: string,
  catalogItemId: string,
  localProductId: string,
) {
  const db = await getDb();
  const conn = await db.query.stockistConnections.findFirst({
    where: and(
      eq(stockistConnections.id, connectionId),
      eq(stockistConnections.pharmacyTenantId, pharmacyTenantId),
      eq(stockistConnections.status, 'active'),
    ),
  });
  if (!conn) throw new Error('Connection not found');

  const localProduct = await db.query.products.findFirst({
    where: and(
      eq(products.id, localProductId),
      eq(products.tenantId, pharmacyTenantId),
    ),
  });
  if (!localProduct) throw new Error('Local product not found');

  const [updated] = await db.update(stockistCatalogItems).set({
    localProductId,
    syncedAt: new Date(),
  }).where(and(
    eq(stockistCatalogItems.id, catalogItemId),
    eq(stockistCatalogItems.connectionId, connectionId),
    eq(stockistCatalogItems.pharmacyTenantId, pharmacyTenantId),
  )).returning();

  if (!updated) throw new Error('Catalog item not found');
  return updated;
}

export async function pushCatalogToActiveConnections(
  stockistTenantId: string,
  _changedProductIds?: string[],
) {
  // me89: today this re-syncs everything; the parameter is kept for callsites
  // that want to signal deltas. A future migration can switch to per-product
  // upserts.
  const db = await getDb();
  const activeConnections = await db.select({ id: stockistConnections.id })
    .from(stockistConnections)
    .where(and(
      eq(stockistConnections.stockistTenantId, stockistTenantId),
      eq(stockistConnections.status, 'active'),
    ));
  let synced = 0;
  for (const conn of activeConnections) {
    await syncCatalogToConnection(conn.id, stockistTenantId);
    synced++;
  }
  const { syncPublicCatalog } = await import('./publicCatalogService.js');
  await syncPublicCatalog(stockistTenantId);
  return { synced };
}

export async function countPendingConnections(stockistTenantId: string) {
  const db = await getDb();
  const [{ total }] = await db
    .select({ total: count() })
    .from(stockistConnections)
    .where(and(
      eq(stockistConnections.stockistTenantId, stockistTenantId),
      eq(stockistConnections.status, 'pending'),
    ));
  return Number(total);
}
