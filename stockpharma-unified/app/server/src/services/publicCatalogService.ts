import { getDb } from '../db/client.js';
import { tenants, products, productBatches, stockistPublicCatalogItems, stockistConnections } from '../db/schema.js';
import { eq, and, sql, count, ilike, or, notInArray, inArray } from 'drizzle-orm';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export async function ensurePublicSlug(stockistTenantId: string): Promise<string> {
  const db = await getDb();
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, stockistTenantId) });
  if (!tenant) throw new Error('Tenant not found');
  if (tenant.publicSlug) return tenant.publicSlug;

  let base = slugify(tenant.businessName);
  if (!base) base = 'stockist';
  let slug = base;
  let n = 1;
  while (true) {
    const existing = await db.query.tenants.findFirst({ where: eq(tenants.publicSlug, slug) });
    if (!existing || existing.id === stockistTenantId) break;
    slug = `${base}-${n++}`;
  }
  await db.update(tenants).set({ publicSlug: slug }).where(eq(tenants.id, stockistTenantId));
  return slug;
}

export async function syncPublicCatalog(stockistTenantId: string) {
  const db = await getDb();
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, stockistTenantId) });
  const defaultPublic = tenant?.notificationsJson
    ? (() => { try { return JSON.parse(tenant.notificationsJson!).publishNewProductsByDefault !== false; } catch { return true; } })()
    : true;

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
      minStockLevel: products.minStockLevel,
      stock: sql<number>`COALESCE(SUM(${productBatches.qtyOnHand}), 0)`.as('stock'),
    })
    .from(products)
    .leftJoin(productBatches, eq(productBatches.productId, products.id))
    .where(and(eq(products.tenantId, stockistTenantId), eq(products.isActive, true)))
    .groupBy(products.id);

  // M42: remove orphaned/inactive products from the public catalog
  const productIds = productRows.map(p => p.id);
  let removed = 0;
  if (productIds.length > 0) {
    const r = await db.delete(stockistPublicCatalogItems).where(and(
      eq(stockistPublicCatalogItems.stockistTenantId, stockistTenantId),
      notInArray(stockistPublicCatalogItems.productId, productIds),
    )).returning({ id: stockistPublicCatalogItems.id });
    removed = r.length;
  } else {
    const r = await db.delete(stockistPublicCatalogItems)
      .where(eq(stockistPublicCatalogItems.stockistTenantId, stockistTenantId))
      .returning({ id: stockistPublicCatalogItems.id });
    removed = r.length;
  }

  const now = new Date();
  let synced = 0;
  for (const p of productRows) {
    const stock = Number(p.stock);
    const min = p.minStockLevel;
    const availabilityHint = stock === 0 ? 'out_of_stock' : stock < min ? 'low' : 'in_stock';

    const existing = await db.query.stockistPublicCatalogItems.findFirst({
      where: and(
        eq(stockistPublicCatalogItems.stockistTenantId, stockistTenantId),
        eq(stockistPublicCatalogItems.productId, p.id),
      ),
    });

    if (existing) {
      // C12: never persist `saleRate` (PTR) into the public catalog table.
      await db.update(stockistPublicCatalogItems).set({
        name: p.name,
        genericName: p.genericName,
        manufacturer: p.manufacturer,
        category: p.category,
        hsnCode: p.hsnCode,
        scheduleType: p.scheduleType,
        packSize: p.packSize,
        gstRate: p.gstRate,
        mrp: p.mrp,
        saleRate: null as any,
        availabilityHint,
        syncedAt: now,
      }).where(eq(stockistPublicCatalogItems.id, existing.id));
    } else {
      await db.insert(stockistPublicCatalogItems).values({
        stockistTenantId,
        productId: p.id,
        name: p.name,
        genericName: p.genericName,
        manufacturer: p.manufacturer,
        category: p.category,
        hsnCode: p.hsnCode,
        scheduleType: p.scheduleType,
        packSize: p.packSize,
        gstRate: p.gstRate,
        mrp: p.mrp,
        saleRate: null as any,
        availabilityHint,
        isPublic: defaultPublic,
        syncedAt: now,
      });
    }
    synced++;
  }

  await ensurePublicSlug(stockistTenantId);
  return { synced, removed };
}

/** Hide duplicate publicly-listed stockists (same business name); keep the one with a slug. */
export async function dedupePublicStockistListings() {
  const db = await getDb();
  const listed = await db.select({
    id: tenants.id,
    businessName: tenants.businessName,
    publicSlug: tenants.publicSlug,
  }).from(tenants).where(and(
    eq(tenants.tenantType, 'stockist'),
    eq(tenants.isPubliclyListed, true),
  ));

  const groups = new Map<string, typeof listed>();
  for (const row of listed) {
    const key = row.businessName.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  let hidden = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const keeper = group.find(t => t.publicSlug) ?? group[0];
    for (const t of group) {
      if (t.id === keeper.id) continue;
      await db.update(tenants).set({ isPubliclyListed: false }).where(eq(tenants.id, t.id));
      hidden++;
    }
  }
  return { hidden };
}

async function attachPublicProductCounts(stockistIds: string[]) {
  if (stockistIds.length === 0) return new Map<string, number>();
  const db = await getDb();
  const counts = await db
    .select({
      stockistTenantId: stockistPublicCatalogItems.stockistTenantId,
      productCount: count(),
    })
    .from(stockistPublicCatalogItems)
    .where(and(
      eq(stockistPublicCatalogItems.isPublic, true),
      inArray(stockistPublicCatalogItems.stockistTenantId, stockistIds),
    ))
    .groupBy(stockistPublicCatalogItems.stockistTenantId);

  return new Map(counts.map(c => [c.stockistTenantId, Number(c.productCount)]));
}

export async function listPublicStockists(opts: {
  state?: string;
  category?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const conditions = [
    eq(tenants.tenantType, 'stockist'),
    eq(tenants.isPubliclyListed, true),
    sql`${tenants.publicSlug} IS NOT NULL`,
  ];

  if (opts.state) {
    conditions.push(or(
      eq(tenants.stateCode, opts.state),
      sql`${tenants.coverageStateCodes} ILIKE ${'%"' + opts.state + '"%'}`,
    )!);
  }

  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    conditions.push(or(
      ilike(tenants.businessName, q),
      ilike(tenants.gstin, q),
      ilike(tenants.publicSlug, q),
    )!);
  }

  if (opts.category?.trim()) {
    conditions.push(sql`${tenants.categories} ILIKE ${'%"' + opts.category.trim() + '"%'}`);
  }

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(tenants)
    .where(where);

  const rows = await db
    .select({
      id: tenants.id,
      publicSlug: tenants.publicSlug,
      businessName: tenants.businessName,
      gstin: tenants.gstin,
      stateCode: tenants.stateCode,
      categories: tenants.categories,
      aboutText: tenants.aboutText,
      acceptingNewConnections: tenants.acceptingNewConnections,
      logoUrl: tenants.logoUrl,
      syncedAt: sql<string>`(
        SELECT MAX(pci.synced_at) FROM stockist_public_catalog_items pci
        WHERE pci.stockist_tenant_id = ${tenants.id}
      )`.as('syncedAt'),
    })
    .from(tenants)
    .where(where)
    .limit(pageSize)
    .offset(offset);

  const countMap = await attachPublicProductCounts(rows.map(r => r.id));

  // One card per public slug (PGlite can return duplicate tenant rows)
  const seenSlugs = new Set<string>();
  const deduped = rows.filter(r => {
    const slug = r.publicSlug ?? '';
    if (!slug || seenSlugs.has(slug)) return false;
    seenSlugs.add(slug);
    return true;
  });

  return {
    data: deduped.map(r => ({
      ...r,
      productCount: countMap.get(r.id) ?? 0,
      categories: r.categories ? JSON.parse(r.categories) : [],
    })),
    total: Number(total),
    page,
    pageSize,
  };
}

export async function getPublicStockistBySlug(slug: string) {
  const db = await getDb();
  const tenant = await db.query.tenants.findFirst({
    where: and(
      eq(tenants.publicSlug, slug),
      eq(tenants.tenantType, 'stockist'),
      eq(tenants.isPubliclyListed, true),
    ),
  });
  if (!tenant) return null;

  const sampleProducts = await db
    .select({
      id: stockistPublicCatalogItems.id,
      name: stockistPublicCatalogItems.name,
      category: stockistPublicCatalogItems.category,
      mrp: stockistPublicCatalogItems.mrp,
      availabilityHint: stockistPublicCatalogItems.availabilityHint,
    })
    .from(stockistPublicCatalogItems)
    .where(and(
      eq(stockistPublicCatalogItems.stockistTenantId, tenant.id),
      eq(stockistPublicCatalogItems.isPublic, true),
    ))
    .limit(10);

  const [{ productCount }] = await db
    .select({ productCount: count() })
    .from(stockistPublicCatalogItems)
    .where(and(
      eq(stockistPublicCatalogItems.stockistTenantId, tenant.id),
      eq(stockistPublicCatalogItems.isPublic, true),
    ));

  const [{ partnerCount }] = await db
    .select({ partnerCount: count() })
    .from(stockistConnections)
    .where(and(
      eq(stockistConnections.stockistTenantId, tenant.id),
      eq(stockistConnections.status, 'active'),
    ));

  return {
    id: tenant.id,
    publicSlug: tenant.publicSlug,
    businessName: tenant.businessName,
    gstin: tenant.gstin,
    stateCode: tenant.stateCode,
    aboutText: tenant.aboutText,
    coverageStateCodes: tenant.coverageStateCodes ? JSON.parse(tenant.coverageStateCodes) : [tenant.stateCode],
    categories: tenant.categories ? JSON.parse(tenant.categories) : [],
    acceptingNewConnections: tenant.acceptingNewConnections,
    logoUrl: tenant.logoUrl,
    productCount: Number(productCount),
    partnerCount: Number(partnerCount),
    sampleProducts,
  };
}

export async function getPublicCatalog(slug: string, opts: {
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}) {
  const profile = await getPublicStockistBySlug(slug);
  if (!profile) return null;

  const db = await getDb();
  const page = Math.max(1, opts.page ?? 1);
  // M44: cap public catalog pageSize at 20
  const pageSize = Math.min(20, Math.max(1, opts.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const conditions = [
    eq(stockistPublicCatalogItems.stockistTenantId, profile.id),
    eq(stockistPublicCatalogItems.isPublic, true),
  ];

  if (opts.category?.trim()) {
    conditions.push(eq(stockistPublicCatalogItems.category, opts.category.trim()));
  }

  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    conditions.push(or(
      ilike(stockistPublicCatalogItems.name, q),
      ilike(stockistPublicCatalogItems.genericName, q),
      ilike(stockistPublicCatalogItems.manufacturer, q),
    )!);
  }

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(stockistPublicCatalogItems)
    .where(where);

  // C12: project only safe public fields (no PTR/saleRate).
  const items = await db
    .select({
      id: stockistPublicCatalogItems.id,
      productId: stockistPublicCatalogItems.productId,
      name: stockistPublicCatalogItems.name,
      genericName: stockistPublicCatalogItems.genericName,
      manufacturer: stockistPublicCatalogItems.manufacturer,
      category: stockistPublicCatalogItems.category,
      hsnCode: stockistPublicCatalogItems.hsnCode,
      scheduleType: stockistPublicCatalogItems.scheduleType,
      packSize: stockistPublicCatalogItems.packSize,
      gstRate: stockistPublicCatalogItems.gstRate,
      mrp: stockistPublicCatalogItems.mrp,
      availabilityHint: stockistPublicCatalogItems.availabilityHint,
      isPublic: stockistPublicCatalogItems.isPublic,
      syncedAt: stockistPublicCatalogItems.syncedAt,
    })
    .from(stockistPublicCatalogItems)
    .where(where)
    .limit(pageSize)
    .offset(offset);

  return {
    stockist: { publicSlug: profile.publicSlug, businessName: profile.businessName },
    data: items,
    total: Number(total),
    page,
    pageSize,
  };
}

export async function getPublicCatalogSettings(stockistTenantId: string) {
  const db = await getDb();
  return db.select({
    productId: stockistPublicCatalogItems.productId,
    name: stockistPublicCatalogItems.name,
    category: stockistPublicCatalogItems.category,
    isPublic: stockistPublicCatalogItems.isPublic,
    syncedAt: stockistPublicCatalogItems.syncedAt,
  }).from(stockistPublicCatalogItems)
    .where(eq(stockistPublicCatalogItems.stockistTenantId, stockistTenantId));
}

export async function setProductPublicVisibility(
  stockistTenantId: string,
  productId: string,
  isPublic: boolean,
) {
  const db = await getDb();
  const row = await db.query.stockistPublicCatalogItems.findFirst({
    where: and(
      eq(stockistPublicCatalogItems.stockistTenantId, stockistTenantId),
      eq(stockistPublicCatalogItems.productId, productId),
    ),
  });
  if (!row) throw new Error('Product not in public catalog — sync first');
  const [updated] = await db.update(stockistPublicCatalogItems)
    .set({ isPublic })
    .where(eq(stockistPublicCatalogItems.id, row.id))
    .returning();
  return updated;
}
