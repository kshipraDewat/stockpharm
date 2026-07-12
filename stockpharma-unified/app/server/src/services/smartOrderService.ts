import { getDb } from '../db/client.js';
import {
  smartOrderSessions, stockistConnections, stockistCatalogItems, tenants,
} from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { env } from '../env.js';
import { parseOrderText } from './aiOrderParseService.js';

export interface ParsedSmartItem {
  productName: string;
  qty: number;
  matches: Array<{
    connectionId: string;
    stockistTenantId: string;
    stockistName: string;
    catalogItemId: string;
    stockistProductId: string;
    name: string;
    saleRate: number;
    mrp: number;
    availability: string;
  }>;
}

export interface SmartRecommendation {
  strategy: 'best_single' | 'cheapest_split' | 'fastest_delivery';
  label: string;
  description: string;
  items: Array<{
    productName: string;
    qty: number;
    connectionId: string;
    stockistName: string;
    catalogItemId: string;
    stockistProductId: string;
    name: string;
    unitPrice: number;
    lineTotal: number;
  }>;
  totalCost: number;
  stockistCount: number;
  itemsCovered: number;
  totalItems: number;
  savingsVsSingle?: number;
}

function fuzzyMatchCatalog(name: string, catalog: typeof stockistCatalogItems.$inferSelect[]) {
  const q = name.trim().toLowerCase();
  if (!q) return [];
  const exact = catalog.filter((c) => c.name.toLowerCase() === q);
  if (exact.length) return exact;
  const partial = catalog.filter(
    (c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()),
  );
  if (partial.length) return partial;
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  return catalog.filter((c) =>
    tokens.some((t) => c.name.toLowerCase().includes(t)),
  );
}

async function loadActiveCatalog(pharmacyTenantId: string) {
  const db = await getDb();
  const connections = await db
    .select()
    .from(stockistConnections)
    .where(and(
      eq(stockistConnections.pharmacyTenantId, pharmacyTenantId),
      eq(stockistConnections.status, 'active'),
    ));

  const stockistIds = [...new Set(connections.map((c) => c.stockistTenantId))];
  const stockistNames = new Map<string, string>();
  for (const sid of stockistIds) {
    const t = await db.query.tenants.findFirst({ where: eq(tenants.id, sid) });
    if (t) stockistNames.set(sid, t.businessName);
  }

  const catalog = await db
    .select()
    .from(stockistCatalogItems)
    .where(eq(stockistCatalogItems.pharmacyTenantId, pharmacyTenantId));

  const connById = new Map(connections.map((c) => [c.id, c]));

  return { connections, catalog, stockistNames, connById };
}

function parseLinesLocally(text: string): Array<{ productName: string; qty: number }> {
  const lines = text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return lines.map((raw) => {
    const m = raw.match(/^(.*?)[\s,:\-–—]*(?:x\s*)?(\d+)\s*(?:n|nos|tabs?|strips?|boxes?|pcs?|units?)?\.?$/i);
    const name = (m ? m[1] : raw).trim();
    const qty = m ? Math.max(1, parseInt(m[2], 10)) : 1;
    return { productName: name, qty };
  }).filter((l) => l.productName);
}

export async function parseSmartOrder(pharmacyTenantId: string, rawText: string) {
  const db = await getDb();
  const { catalog, stockistNames, connById } = await loadActiveCatalog(pharmacyTenantId);

  let parsedItems: Array<{ productName: string; qty: number }>;
  try {
    if (env.GEMINI_API_KEY) {
      const firstConn = [...connById.values()][0];
      if (firstConn) {
        const ai = await parseOrderText(firstConn.stockistTenantId, rawText);
        parsedItems = ai.items.map((i) => ({ productName: i.productName, qty: i.qty }));
      } else {
        parsedItems = parseLinesLocally(rawText);
      }
    } else {
      parsedItems = parseLinesLocally(rawText);
    }
  } catch {
    parsedItems = parseLinesLocally(rawText);
  }

  const items: ParsedSmartItem[] = parsedItems.map((p) => {
    const matches = fuzzyMatchCatalog(p.productName, catalog)
      .filter((c) => c.availabilityHint !== 'out_of_stock')
      .map((c) => {
        const conn = connById.get(c.connectionId);
        const stockistTenantId = conn?.stockistTenantId ?? '';
        return {
          connectionId: c.connectionId,
          stockistTenantId,
          stockistName: stockistNames.get(stockistTenantId) ?? 'Stockist',
          catalogItemId: c.id,
          stockistProductId: c.stockistProductId,
          name: c.name,
          saleRate: Number(c.saleRate),
          mrp: Number(c.mrp),
          availability: c.availabilityHint,
        };
      });
    return { productName: p.productName, qty: p.qty, matches };
  });

  const [session] = await db.insert(smartOrderSessions).values({
    pharmacyTenantId,
    rawText,
    parsedJson: JSON.stringify(items),
  }).returning();

  return { sessionId: session.id, items };
}

export async function recommendSmartOrder(pharmacyTenantId: string, sessionId: string) {
  const db = await getDb();
  const session = await db.query.smartOrderSessions.findFirst({
    where: and(
      eq(smartOrderSessions.id, sessionId),
      eq(smartOrderSessions.pharmacyTenantId, pharmacyTenantId),
    ),
  });
  if (!session) throw new Error('Session not found');

  const items: ParsedSmartItem[] = JSON.parse(session.parsedJson);
  const totalItems = items.length;

  // Best single stockist: most items covered, tie-break lowest total cost
  const stockistScores = new Map<string, {
    connectionId: string;
    stockistName: string;
    lines: SmartRecommendation['items'];
    cost: number;
    covered: number;
  }>();

  for (const item of items) {
    for (const m of item.matches) {
      const key = m.connectionId;
      if (!stockistScores.has(key)) {
        stockistScores.set(key, {
          connectionId: m.connectionId,
          stockistName: m.stockistName,
          lines: [],
          cost: 0,
          covered: 0,
        });
      }
    }
  }

  for (const item of items) {
    const byConn = new Map(item.matches.map((m) => [m.connectionId, m]));
    for (const [connId, score] of stockistScores) {
      const m = byConn.get(connId);
      if (m) {
        score.lines.push({
          productName: item.productName,
          qty: item.qty,
          connectionId: m.connectionId,
          stockistName: m.stockistName,
          catalogItemId: m.catalogItemId,
          stockistProductId: m.stockistProductId,
          name: m.name,
          unitPrice: m.saleRate,
          lineTotal: m.saleRate * item.qty,
        });
        score.cost += m.saleRate * item.qty;
        score.covered += 1;
      }
    }
  }

  const singleCandidates = [...stockistScores.values()]
    .filter((s) => s.covered > 0)
    .sort((a, b) => b.covered - a.covered || a.cost - b.cost);

  const bestSingle = singleCandidates[0];
  const bestSingleRec: SmartRecommendation | null = bestSingle ? {
    strategy: 'best_single',
    label: 'Best Single Stockist',
    description: `Order everything possible from ${bestSingle.stockistName}`,
    items: bestSingle.lines,
    totalCost: bestSingle.cost,
    stockistCount: 1,
    itemsCovered: bestSingle.covered,
    totalItems,
  } : null;

  // Cheapest split: per-item lowest price across all matches
  const splitLines: SmartRecommendation['items'] = [];
  let splitCost = 0;
  let splitCovered = 0;
  const splitStockists = new Set<string>();

  for (const item of items) {
    if (!item.matches.length) continue;
    const cheapest = [...item.matches].sort((a, b) => a.saleRate - b.saleRate)[0];
    splitLines.push({
      productName: item.productName,
      qty: item.qty,
      connectionId: cheapest.connectionId,
      stockistName: cheapest.stockistName,
      catalogItemId: cheapest.catalogItemId,
      stockistProductId: cheapest.stockistProductId,
      name: cheapest.name,
      unitPrice: cheapest.saleRate,
      lineTotal: cheapest.saleRate * item.qty,
    });
    splitCost += cheapest.saleRate * item.qty;
    splitCovered += 1;
    splitStockists.add(cheapest.connectionId);
  }

  const cheapestSplit: SmartRecommendation = {
    strategy: 'cheapest_split',
    label: 'Cheapest Split',
    description: 'Lowest price per item across all connected stockists',
    items: splitLines,
    totalCost: splitCost,
    stockistCount: splitStockists.size,
    itemsCovered: splitCovered,
    totalItems,
    savingsVsSingle: bestSingleRec ? Math.max(0, bestSingleRec.totalCost - splitCost) : undefined,
  };

  // Fastest delivery: prefer in_stock, then low — same as best single for now (no delivery calendar in SP)
  const fastestLines: SmartRecommendation['items'] = [];
  let fastCost = 0;
  let fastCovered = 0;
  const fastStockists = new Set<string>();

  for (const item of items) {
    const sorted = [...item.matches].sort((a, b) => {
      const rank = (h: string) => (h === 'in_stock' ? 0 : h === 'low' ? 1 : 2);
      return rank(a.availability) - rank(b.availability) || a.saleRate - b.saleRate;
    });
    const pick = sorted[0];
    if (!pick) continue;
    fastestLines.push({
      productName: item.productName,
      qty: item.qty,
      connectionId: pick.connectionId,
      stockistName: pick.stockistName,
      catalogItemId: pick.catalogItemId,
      stockistProductId: pick.stockistProductId,
      name: pick.name,
      unitPrice: pick.saleRate,
      lineTotal: pick.saleRate * item.qty,
    });
    fastCost += pick.saleRate * item.qty;
    fastCovered += 1;
    fastStockists.add(pick.connectionId);
  }

  const fastestDelivery: SmartRecommendation = {
    strategy: 'fastest_delivery',
    label: 'Fastest Delivery',
    description: 'Prioritises in-stock items from connected stockists',
    items: fastestLines,
    totalCost: fastCost,
    stockistCount: fastStockists.size,
    itemsCovered: fastCovered,
    totalItems,
  };

  const recommendations = [bestSingleRec, cheapestSplit, fastestDelivery].filter(Boolean) as SmartRecommendation[];

  await db.update(smartOrderSessions)
    .set({ recommendationsJson: JSON.stringify(recommendations), updatedAt: new Date() })
    .where(eq(smartOrderSessions.id, sessionId));

  return { sessionId, recommendations };
}
