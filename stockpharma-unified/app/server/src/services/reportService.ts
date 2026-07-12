import { getDb } from '../db/client.js';
import { orders, orderItems, bills, billItems, payments, products, pharmacies, productBatches, returns, stockistConnections, purchases, suppliers, purchaseItems } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql, count, sum, lt, isNull, isNotNull, inArray, or, ne } from 'drizzle-orm';
import { round2 } from '../lib/gst.js';
import { markOverdueBills, buildOverdueBillFilter } from './billService.js';

export async function getDashboardKpis(tenantId: string, from?: string, to?: string) {
  await markOverdueBills(tenantId);
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';
  const rangeFrom = from ?? monthStart;
  const rangeTo = to ?? today;

  const [todayRow] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)` })
    .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.orderDate, today)));

  const [periodRow] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(total AS NUMERIC)), 0)` })
    .from(orders).where(and(
      eq(orders.tenantId, tenantId),
      gte(orders.orderDate, rangeFrom),
      lte(orders.orderDate, rangeTo),
    ));

  const [outstandingRow] = await db.select({ total: sql<number>`COALESCE(SUM(CAST(outstanding AS NUMERIC)), 0)` })
    .from(pharmacies).where(eq(pharmacies.tenantId, tenantId));

  const lowStockProducts = await db.select({
    id: products.id, productId: products.id, name: products.name, minStockLevel: products.minStockLevel,
    stock: sql<number>`COALESCE(SUM(${productBatches.qtyOnHand}), 0)`,
  }).from(products)
    .leftJoin(productBatches, eq(products.id, productBatches.productId))
    .where(eq(products.tenantId, tenantId))
    .groupBy(products.id)
    .having(sql`COALESCE(SUM(${productBatches.qtyOnHand}), 0) < ${products.minStockLevel}`)
    .limit(5);

  const allLowStock = await db.select({
    id: products.id,
    stock: sql<number>`COALESCE(SUM(${productBatches.qtyOnHand}), 0)`,
  }).from(products)
    .leftJoin(productBatches, eq(products.id, productBatches.productId))
    .where(eq(products.tenantId, tenantId))
    .groupBy(products.id)
    .having(sql`COALESCE(SUM(${productBatches.qtyOnHand}), 0) < ${products.minStockLevel}`);

  const [pendingOrders] = await db.select({ c: count() }).from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.status, 'pending')));

  const [incomingPortalOrders] = await db.select({ c: count() }).from(orders)
    .where(and(
      eq(orders.tenantId, tenantId),
      eq(orders.source, 'pharmacy_submitted'),
      eq(orders.status, 'pending'),
      isNull(orders.approvedAt),
    ));

  const [packBacklogOrders] = await db.select({ c: count() }).from(orders)
    .where(and(
      eq(orders.tenantId, tenantId),
      eq(orders.status, 'pending'),
      or(
        ne(orders.source, 'pharmacy_submitted'),
        isNotNull(orders.approvedAt),
      ),
    ));

  const [overdueCount] = await db.select({ c: count() }).from(bills)
    .where(and(eq(bills.tenantId, tenantId), buildOverdueBillFilter(today)));

  const [activeConnections] = await db.select({ c: count() }).from(stockistConnections)
    .where(and(eq(stockistConnections.stockistTenantId, tenantId), eq(stockistConnections.status, 'active')));

  const recentOrders = await db.select({
    id: orders.id, orderNumber: orders.orderNumber, orderDate: orders.orderDate,
    total: orders.total, status: orders.status, source: orders.source, pharmacyName: pharmacies.name,
  }).from(orders)
    .leftJoin(pharmacies, eq(orders.pharmacyId, pharmacies.id))
    .where(eq(orders.tenantId, tenantId))
    .orderBy(desc(orders.createdAt)).limit(5);

  return {
    todaySales: Number(todayRow?.total ?? 0),
    monthSales: Number(periodRow?.total ?? 0),
    periodFrom: rangeFrom,
    periodTo: rangeTo,
    outstandingTotal: Number(outstandingRow?.total ?? 0),
    lowStockCount: allLowStock.length,
    pendingOrders: Number(pendingOrders?.c ?? 0),
    packBacklogOrders: Number(packBacklogOrders?.c ?? 0),
    incomingPortalOrders: Number(incomingPortalOrders?.c ?? 0),
    activeConnections: Number(activeConnections?.c ?? 0),
    overdueCount: Number(overdueCount?.c ?? 0),
    recentOrders,
    lowStockProducts: lowStockProducts.map(p => ({ ...p, stock: Number(p.stock) })),
  };
}

export async function getSalesReport(tenantId: string, from: string, to: string, page = 1, pageSize = 50) {
  const db = await getDb();

  const byDay = await db.select({
    date: orders.orderDate,
    total: sql<number>`COALESCE(SUM(CAST(${orders.total} AS NUMERIC)), 0)`,
    orders: count(),
  }).from(orders)
    .where(and(eq(orders.tenantId, tenantId), gte(orders.orderDate, from), lte(orders.orderDate, to)))
    .groupBy(orders.orderDate).orderBy(orders.orderDate);

  const topProducts = await db.select({
    productId: products.id, name: products.name,
    qty: sql<number>`SUM(${orderItems.qty})`,
    revenue: sql<number>`SUM(CAST(${orderItems.lineTotal} AS NUMERIC))`,
  }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(eq(orders.tenantId, tenantId), gte(orders.orderDate, from), lte(orders.orderDate, to)))
    .groupBy(products.id).orderBy(desc(sql`SUM(CAST(${orderItems.lineTotal} AS NUMERIC))`)).limit(10);

  const topPharmacies = await db.select({
    pharmacyId: pharmacies.id, name: pharmacies.name,
    revenue: sql<number>`SUM(CAST(${orders.total} AS NUMERIC))`,
    orders: count(),
  }).from(orders)
    .innerJoin(pharmacies, eq(orders.pharmacyId, pharmacies.id))
    .where(and(eq(orders.tenantId, tenantId), gte(orders.orderDate, from), lte(orders.orderDate, to)))
    .groupBy(pharmacies.id).orderBy(desc(sql`SUM(CAST(${orders.total} AS NUMERIC))`)).limit(10);

  const byCategory = await db.select({
    category: products.category,
    revenue: sql<number>`SUM(CAST(${orderItems.lineTotal} AS NUMERIC))`,
  }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(eq(orders.tenantId, tenantId), gte(orders.orderDate, from), lte(orders.orderDate, to)))
    .groupBy(products.category);

  const [summary] = await db.select({
    total: sql<number>`COALESCE(SUM(CAST(${orders.total} AS NUMERIC)), 0)`,
    orders: count(),
  }).from(orders)
    .where(and(eq(orders.tenantId, tenantId), gte(orders.orderDate, from), lte(orders.orderDate, to)));

  const totalOrders = Number(summary?.orders ?? 0);
  const totalRevenue = Number(summary?.total ?? 0);

  const offset = (page - 1) * pageSize;
  const orderRows = await db.select({
    id: orders.id, orderNumber: orders.orderNumber, orderDate: orders.orderDate,
    total: orders.total, status: orders.status, pharmacyName: pharmacies.name,
  }).from(orders)
    .leftJoin(pharmacies, eq(orders.pharmacyId, pharmacies.id))
    .where(and(eq(orders.tenantId, tenantId), gte(orders.orderDate, from), lte(orders.orderDate, to)))
    .orderBy(desc(orders.orderDate))
    .limit(pageSize).offset(offset);

  return {
    dailySales: byDay.map(r => ({ date: r.date, total: Number(r.total), orders: Number(r.orders) })),
    topProducts: topProducts.map(r => ({ ...r, qty: Number(r.qty), revenue: Number(r.revenue) })),
    topPharmacies: topPharmacies.map(r => ({ ...r, revenue: Number(r.revenue), orders: Number(r.orders) })),
    byCategory: byCategory.map(r => ({ category: r.category, revenue: Number(r.revenue) })),
    summary: { total: totalRevenue, orders: totalOrders, avgOrderValue: totalOrders ? round2(totalRevenue / totalOrders) : 0 },
    orders: orderRows.map(r => ({ ...r, total: Number(r.total) })),
    ordersPagination: { page, pageSize, total: totalOrders },
  };
}

export async function getOutstandingReport(tenantId: string, asOfDate?: string) {
  const db = await getDb();
  const asOf = asOfDate ? new Date(asOfDate).getTime() : Date.now();

  const unpaidBills = await db.select({
    billId: bills.id, billNumber: bills.billNumber, billDate: bills.billDate, dueDate: bills.dueDate,
    total: bills.total, paidAmount: bills.paidAmount,
    pharmacyId: pharmacies.id, pharmacyName: pharmacies.name,
  }).from(bills)
    .innerJoin(pharmacies, eq(bills.pharmacyId, pharmacies.id))
    .where(and(
      eq(bills.tenantId, tenantId),
      sql`${bills.status} <> 'voided'`,
    ));

  const result = unpaidBills
    .filter(b => parseFloat(b.paidAmount) < parseFloat(b.total))
    .map(b => {
      const outstanding = round2(parseFloat(b.total) - parseFloat(b.paidAmount));
      const ageDays = Math.floor((asOf - new Date(b.dueDate).getTime()) / 86400000);
      return { ...b, outstanding, ageDays };
    });

  const aging = { current: 0, overdue30: 0, overdue60: 0, overdue90: 0, overdue90plus: 0 };
  for (const b of result) {
    if (b.ageDays <= 0) aging.current += b.outstanding;
    else if (b.ageDays <= 30) aging.overdue30 += b.outstanding;
    else if (b.ageDays <= 60) aging.overdue60 += b.outstanding;
    else if (b.ageDays <= 90) aging.overdue90 += b.outstanding;
    else aging.overdue90plus += b.outstanding;
  }

  const topDefaulters = Object.values(
    result.reduce((acc, b) => {
      if (!acc[b.pharmacyId]) acc[b.pharmacyId] = { pharmacyId: b.pharmacyId, name: b.pharmacyName, outstanding: 0, oldestDueDays: 0 };
      acc[b.pharmacyId].outstanding += b.outstanding;
      acc[b.pharmacyId].oldestDueDays = Math.max(acc[b.pharmacyId].oldestDueDays, b.ageDays);
      return acc;
    }, {} as Record<string, { pharmacyId: string; name: string; outstanding: number; oldestDueDays: number }>)
  ).sort((a, b) => b.outstanding - a.outstanding).slice(0, 10);

  const totalOutstanding = round2(result.reduce((s, b) => s + b.outstanding, 0));
  // M39: any bill past its due date is overdue
  const overdueAmount = round2(result.filter(b => b.ageDays > 0).reduce((s, b) => s + b.outstanding, 0));
  const avgCollectionDays = result.length
    ? round2(result.reduce((s, b) => s + Math.max(0, b.ageDays), 0) / result.length)
    : 0;

  return {
    totalOutstanding,
    overdueAmount,
    avgCollectionDays,
    aging,
    topDefaulters,
    bills: result.slice(0, 50),
  };
}

export async function getGstReport(tenantId: string, month: string) {
  const db = await getDb();
  const from = `${month}-01`;
  const toDate = new Date(month + '-01');
  toDate.setMonth(toDate.getMonth() + 1);
  const to = toDate.toISOString().split('T')[0];

  const salesBills = await db.select({
    cgst: sql<number>`COALESCE(SUM(CAST(${bills.cgst} AS NUMERIC)), 0)`,
    sgst: sql<number>`COALESCE(SUM(CAST(${bills.sgst} AS NUMERIC)), 0)`,
    igst: sql<number>`COALESCE(SUM(CAST(${bills.igst} AS NUMERIC)), 0)`,
    taxableValue: sql<number>`COALESCE(SUM(CAST(${bills.subtotal} AS NUMERIC)), 0)`,
    total: sql<number>`COALESCE(SUM(CAST(${bills.total} AS NUMERIC)), 0)`,
  }).from(bills).where(and(eq(bills.tenantId, tenantId), gte(bills.billDate, from), lt(bills.billDate, to)));

  // C14: aggregate purchase-side ITC (CGST/SGST/IGST) for the month.
  // We classify intra/interstate by comparing supplier state to tenant state.
  const tenantStateRow = await db.select({ s: sql<string>`${pharmacies.tenantId}` })
    .from(pharmacies).where(eq(pharmacies.tenantId, tenantId)).limit(1);
  // Tenant state comes from `tenants` not `pharmacies`; load it directly.
  const tenantRow = await db.execute(sql`SELECT state_code FROM tenants WHERE id = ${tenantId}`);
  const tenantStateCode: string = ((tenantRow as any).rows?.[0]?.state_code ?? '').toString();

  const purchaseRows = await db.select({
    isInterstate: sql<boolean>`CASE WHEN COALESCE(${suppliers.stateCode}, '') = ${tenantStateCode} THEN false ELSE true END`,
    lineSubtotal: purchaseItems.lineSubtotal,
    lineTax: purchaseItems.lineTax,
    lineTotal: purchaseItems.lineTotal,
    gstRate: purchaseItems.gstRate,
  }).from(purchaseItems)
    .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
    .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(and(
      eq(purchases.tenantId, tenantId),
      gte(purchases.invoiceDate, from),
      lt(purchases.invoiceDate, to),
    ));

  let cgstInput = 0, sgstInput = 0, igstInput = 0, taxableValueIn = 0, totalIn = 0;
  for (const r of purchaseRows) {
    const sub = parseFloat(r.lineSubtotal?.toString() ?? '0');
    const tax = parseFloat(r.lineTax?.toString() ?? '0');
    const tot = parseFloat(r.lineTotal?.toString() ?? '0');
    taxableValueIn += sub;
    totalIn += tot;
    if (r.isInterstate) {
      igstInput += tax;
    } else {
      const half = round2(tax / 2);
      cgstInput += half;
      sgstInput += round2(tax - half);
    }
  }

  // byRate breakdown for sales bills (derived from billItems; tax = cgst+sgst+igst)
  const byRateRows = await db.select({
    rate: billItems.gstRate,
    taxable: sql<number>`COALESCE(SUM(CAST(${billItems.lineSubtotal} AS NUMERIC)), 0)`,
    tax: sql<number>`COALESCE(SUM(CAST(${billItems.cgst} AS NUMERIC) + CAST(${billItems.sgst} AS NUMERIC) + CAST(${billItems.igst} AS NUMERIC)), 0)`,
  }).from(billItems)
    .innerJoin(bills, eq(billItems.billId, bills.id))
    .where(and(eq(bills.tenantId, tenantId), gte(bills.billDate, from), lt(bills.billDate, to)))
    .groupBy(billItems.gstRate);

  const byRate = byRateRows.map(r => ({
    rate: Number(r.rate),
    taxableValue: round2(Number(r.taxable)),
    tax: round2(Number(r.tax)),
  })).sort((a, b) => a.rate - b.rate);

  return {
    month,
    sales: {
      cgst: round2(Number(salesBills[0]?.cgst ?? 0)),
      sgst: round2(Number(salesBills[0]?.sgst ?? 0)),
      igst: round2(Number(salesBills[0]?.igst ?? 0)),
      taxableValue: round2(Number(salesBills[0]?.taxableValue ?? 0)),
      total: round2(Number(salesBills[0]?.total ?? 0)),
    },
    purchases: {
      cgstInput: round2(cgstInput),
      sgstInput: round2(sgstInput),
      igstInput: round2(igstInput),
      taxableValue: round2(taxableValueIn),
      total: round2(totalIn),
    },
    byRate,
  };
}

export async function getStockAgingReport(tenantId: string, asOfDate?: string) {
  const db = await getDb();
  const asOf = asOfDate ? new Date(asOfDate).getTime() : Date.now();
  const rows = await db.select({
    batchId: productBatches.id, productId: products.id, productName: products.name,
    batchNumber: productBatches.batchNumber, expiryDate: productBatches.expiryDate,
    qtyOnHand: productBatches.qtyOnHand, receivedAt: productBatches.receivedAt,
    mrp: productBatches.mrp, purchaseRate: productBatches.purchaseRate,
  }).from(productBatches)
    .innerJoin(products, eq(productBatches.productId, products.id))
    .where(and(eq(productBatches.tenantId, tenantId), sql`${productBatches.qtyOnHand} > 0`));

  const items = rows.map(r => ({
    ...r,
    qtyOnHand: Number(r.qtyOnHand),
    ageDays: Math.floor((asOf - new Date(r.receivedAt).getTime()) / 86400000),
    mrp: parseFloat(r.mrp.toString()),
    purchaseRate: parseFloat(r.purchaseRate.toString()),
    value: round2(Number(r.qtyOnHand) * parseFloat(r.purchaseRate.toString())),
  }));

  const bucketCounts = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const item of items) {
    if (item.ageDays <= 30) bucketCounts.d0_30 += item.qtyOnHand;
    else if (item.ageDays <= 60) bucketCounts.d31_60 += item.qtyOnHand;
    else if (item.ageDays <= 90) bucketCounts.d61_90 += item.qtyOnHand;
    else bucketCounts.d90plus += item.qtyOnHand;
  }

  return {
    buckets: [
      { name: '0-30 Days', quantity: bucketCounts.d0_30 },
      { name: '31-60 Days', quantity: bucketCounts.d31_60 },
      { name: '61-90 Days', quantity: bucketCounts.d61_90 },
      { name: '> 90 Days', quantity: bucketCounts.d90plus },
    ],
    items,
  };
}

export async function getRequiredStockReport(tenantId: string) {
  const db = await getDb();
  const rows = await db.select({
    productId: products.id, name: products.name, category: products.category,
    minStockLevel: products.minStockLevel,
    currentStock: sql<number>`COALESCE(SUM(${productBatches.qtyOnHand}), 0)`,
  }).from(products)
    .leftJoin(productBatches, and(eq(products.id, productBatches.productId), eq(productBatches.tenantId, tenantId)))
    .where(eq(products.tenantId, tenantId))
    .groupBy(products.id)
    .having(sql`COALESCE(SUM(${productBatches.qtyOnHand}), 0) < ${products.minStockLevel}`);

  return rows.map(r => ({
    ...r,
    currentStock: Number(r.currentStock),
    deficit: r.minStockLevel - Number(r.currentStock),
  }));
}

export async function getComplianceReport(tenantId: string, scheduleType: string, month?: string) {
  const db = await getDb();

  // me47: support "all" (every scheduled type) and reject unknown values.
  const VALID = ['NONE', 'H', 'H1', 'X', 'NDPS', 'all'] as const;
  if (!VALID.includes(scheduleType as any)) {
    throw new Error(`Invalid schedule type "${scheduleType}". Allowed: ${VALID.join(', ')}`);
  }
  const conditions = [
    eq(orders.tenantId, tenantId),
    scheduleType === 'all'
      ? inArray(products.scheduleType, ['H', 'H1', 'X', 'NDPS'])
      : eq(products.scheduleType, scheduleType as 'NONE' | 'H' | 'H1' | 'X' | 'NDPS'),
  ];
  if (month) {
    conditions.push(gte(orders.orderDate, month + '-01'));
    const nextMonth = new Date(month + '-01');
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    conditions.push(lt(orders.orderDate, nextMonth.toISOString().split('T')[0]));
  }

  const rows = await db.select({
    orderId: orders.id, orderDate: orders.orderDate,
    pharmacyName: pharmacies.name, pharmacyDl: pharmacies.dlNumber,
    productName: products.name, scheduleType: products.scheduleType,
    qty: orderItems.qty, unit: products.saleUnit,
    batchNumber: productBatches.batchNumber,
    billNumber: bills.billNumber,
  }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(pharmacies, eq(orders.pharmacyId, pharmacies.id))
    .leftJoin(productBatches, eq(orderItems.batchId, productBatches.id))
    .leftJoin(bills, eq(bills.orderId, orders.id))
    .where(and(...conditions))
    .orderBy(desc(orders.orderDate));

  return rows.map(r => ({ ...r, qty: Number(r.qty) }));
}

export async function getProfitReport(tenantId: string, from: string, to: string) {
  const salesData = await getSalesReport(tenantId, from, to);
  const db = await getDb();

  const items = await db.select({
    orderDate: orders.orderDate,
    category: products.category,
    qty: orderItems.qty,
    lineTotal: orderItems.lineTotal,
    purchaseRate: sql<number>`COALESCE(CAST(${productBatches.purchaseRate} AS NUMERIC), CAST(${products.purchaseRate} AS NUMERIC))`,
  }).from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .leftJoin(productBatches, eq(orderItems.batchId, productBatches.id))
    .where(and(eq(orders.tenantId, tenantId), gte(orders.orderDate, from), lte(orders.orderDate, to)));

  let totalRevenue = 0;
  let totalCogs = 0;
  const byDay: Record<string, { revenue: number; profit: number }> = {};
  const byCategory: Record<string, { revenue: number; profit: number }> = {};

  for (const item of items) {
    const revenue = Number(item.lineTotal);
    const cost = Number(item.purchaseRate) * Number(item.qty);
    const profit = revenue - cost;
    totalRevenue += revenue;
    totalCogs += cost;

    const day = item.orderDate;
    if (!byDay[day]) byDay[day] = { revenue: 0, profit: 0 };
    byDay[day].revenue += revenue;
    byDay[day].profit += profit;

    const cat = item.category;
    if (!byCategory[cat]) byCategory[cat] = { revenue: 0, profit: 0 };
    byCategory[cat].revenue += revenue;
    byCategory[cat].profit += profit;
  }

  const grossProfit = round2(totalRevenue - totalCogs);
  const totalRev = round2(totalRevenue);

  const dailySalesWithProfit = salesData.dailySales.map(d => ({
    ...d,
    profit: round2(byDay[d.date]?.profit ?? 0),
  }));

  const categoryBreakdown = Object.entries(byCategory).map(([category, { revenue, profit }]) => ({
    category,
    revenue: round2(revenue),
    profit: round2(profit),
    margin: revenue > 0 ? round2((profit / revenue) * 100) : 0,
  })).sort((a, b) => b.revenue - a.revenue);

  return {
    ...salesData,
    dailySales: dailySalesWithProfit,
    summary: { ...salesData.summary, total: totalRev },
    totalRevenue: totalRev,
    totalProfit: grossProfit,
    grossProfit,
    costOfGoodsSold: round2(totalCogs),
    profitMargin: totalRev > 0 ? round2((grossProfit / totalRev) * 100) : 0,
    categoryBreakdown,
  };
}

export async function getPortalOrdersReport(tenantId: string, from?: string, to?: string) {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const rangeFrom = from ?? today.slice(0, 7) + '-01';
  const rangeTo = to ?? today;

  const portalOrders = await db.select({
    id: orders.id,
    orderNumber: orders.orderNumber,
    status: orders.status,
    total: orders.total,
    orderDate: orders.orderDate,
    pharmacyName: pharmacies.name,
    source: orders.source,
    approvedAt: orders.approvedAt,
    rejectionReason: orders.rejectionReason,
  }).from(orders)
    .leftJoin(pharmacies, eq(orders.pharmacyId, pharmacies.id))
    .where(and(
      eq(orders.tenantId, tenantId),
      eq(orders.source, 'pharmacy_submitted'),
      gte(orders.orderDate, rangeFrom),
      lte(orders.orderDate, rangeTo),
    ))
    .orderBy(desc(orders.createdAt));

  const total = portalOrders.length;
  // M40: discriminate by approvedAt + rejectionReason
  const approved = portalOrders.filter(o => o.approvedAt).length;
  const rejected = portalOrders.filter(o => !o.approvedAt && o.status === 'cancelled' && o.rejectionReason).length;
  const pending = portalOrders.filter(o => !o.approvedAt && o.status === 'pending').length;
  const cancelled = portalOrders.filter(o => o.approvedAt && o.status === 'cancelled').length;

  const byPharmacy = await db.select({
    pharmacyName: pharmacies.name,
    orders: count(),
    volume: sql<number>`COALESCE(SUM(CAST(${orders.total} AS NUMERIC)), 0)`,
  }).from(orders)
    .leftJoin(pharmacies, eq(orders.pharmacyId, pharmacies.id))
    .where(and(
      eq(orders.tenantId, tenantId),
      eq(orders.source, 'pharmacy_submitted'),
      gte(orders.orderDate, rangeFrom),
      lte(orders.orderDate, rangeTo),
    ))
    .groupBy(pharmacies.name)
    .orderBy(desc(sql`COALESCE(SUM(CAST(${orders.total} AS NUMERIC)), 0)`))
    .limit(10);

  // M40: approval rate excludes still-pending orders from the denominator
  const decided = approved + rejected;
  return {
    period: { from: rangeFrom, to: rangeTo },
    summary: {
      totalPortalOrders: total,
      approvalRate: decided > 0 ? round2((approved / decided) * 100) : 0,
      approvedCount: approved,
      rejectionCount: rejected,
      pendingCount: pending,
      cancelledCount: cancelled,
    },
    orders: portalOrders,
    topPharmacies: byPharmacy,
  };
}

export async function getPurchaseAnalysisReport(tenantId: string, from?: string, to?: string) {
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const rangeFrom = from ?? today.slice(0, 7) + '-01';
  const rangeTo = to ?? today;

  const purchaseRows = await db.select({
    id: purchases.id,
    grnNumber: purchases.grnNumber,
    supplierInvoiceNo: purchases.supplierInvoiceNo,
    invoiceDate: purchases.invoiceDate,
    total: purchases.total,
    status: purchases.status,
    supplierName: suppliers.name,
  }).from(purchases)
    .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(and(
      eq(purchases.tenantId, tenantId),
      gte(purchases.invoiceDate, rangeFrom),
      lte(purchases.invoiceDate, rangeTo),
    ))
    .orderBy(desc(purchases.createdAt));

  const totalSpend = purchaseRows.reduce((sum, p) => sum + Number(p.total ?? 0), 0);
  const supplierSet = new Set(purchaseRows.map(p => p.supplierName).filter(Boolean));

  const bySupplier = await db.select({
    supplierName: suppliers.name,
    purchases: count(),
    spend: sql<number>`COALESCE(SUM(CAST(${purchases.total} AS NUMERIC)), 0)`,
  }).from(purchases)
    .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(and(
      eq(purchases.tenantId, tenantId),
      gte(purchases.invoiceDate, rangeFrom),
      lte(purchases.invoiceDate, rangeTo),
    ))
    .groupBy(suppliers.name)
    .orderBy(desc(sql`COALESCE(SUM(CAST(${purchases.total} AS NUMERIC)), 0)`))
    .limit(10);

  return {
    period: { from: rangeFrom, to: rangeTo },
    summary: {
      totalPurchases: purchaseRows.length,
      totalSpend: round2(totalSpend),
      supplierCount: supplierSet.size,
    },
    purchases: purchaseRows,
    topSuppliers: bySupplier,
  };
}
