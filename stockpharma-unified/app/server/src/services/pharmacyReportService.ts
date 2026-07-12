import { getDb } from '../db/client.js';
import {
  retailSales, retailSaleItems, products, productBatches, payableBills, payableBillItems,
  purchases, purchaseItems, pharmacyPurchaseOrders,
} from '../db/schema.js';
import { eq, and, gte, lte, desc, sql, count, inArray, ne } from 'drizzle-orm';
import { round2 } from '../lib/gst.js';
import { markOverduePayableBills, getPayablesOutstandingTotal } from './payableBillService.js';
import { parsePaymentBreakdown } from './retailSaleService.js';

export async function getRetailSalesReport(tenantId: string, from: string, to: string, page = 1, pageSize = 50) {
  const db = await getDb();
  const pg = Math.max(1, page);
  const ps = Math.min(100, pageSize);
  const offset = (pg - 1) * ps;

  const where = and(
    eq(retailSales.tenantId, tenantId),
    eq(retailSales.status, 'completed'),
    gte(retailSales.saleDate, from),
    lte(retailSales.saleDate, to),
  );

  const [summary] = await db.select({
    total: sql<number>`COALESCE(SUM(CAST(${retailSales.total} AS NUMERIC)), 0)`,
    orders: count(),
  }).from(retailSales).where(where);

  const dailySales = await db.select({
    date: retailSales.saleDate,
    total: sql<number>`COALESCE(SUM(CAST(${retailSales.total} AS NUMERIC)), 0)`,
  }).from(retailSales).where(where).groupBy(retailSales.saleDate).orderBy(retailSales.saleDate);

  const topProducts = await db.select({
    productId: retailSaleItems.productId,
    name: products.name,
    qty: sql<number>`COALESCE(SUM(${retailSaleItems.qty}), 0)`,
    revenue: sql<number>`COALESCE(SUM(CAST(${retailSaleItems.lineTotal} AS NUMERIC)), 0)`,
  }).from(retailSaleItems)
    .innerJoin(retailSales, eq(retailSaleItems.saleId, retailSales.id))
    .leftJoin(products, eq(retailSaleItems.productId, products.id))
    .where(where)
    .groupBy(retailSaleItems.productId, products.name)
    .orderBy(desc(sql`COALESCE(SUM(CAST(${retailSaleItems.lineTotal} AS NUMERIC)), 0)`))
    .limit(10);

  const salesForMix = await db.select({
    id: retailSales.id,
    total: retailSales.total,
    paymentMethod: retailSales.paymentMethod,
    paymentBreakdownJson: retailSales.paymentBreakdownJson,
    notes: retailSales.notes,
  }).from(retailSales).where(where);

  const mixMap = new Map<string, { method: string; total: number; count: number }>();
  for (const sale of salesForMix) {
    for (const leg of parsePaymentBreakdown(sale)) {
      const existing = mixMap.get(leg.method) ?? { method: leg.method, total: 0, count: 0 };
      existing.total += leg.amount;
      existing.count += 1;
      mixMap.set(leg.method, existing);
    }
  }
  const paymentMix = Array.from(mixMap.values()).map(r => ({
    method: r.method,
    total: round2(r.total),
    count: r.count,
  }));

  const ordersRaw = await db.select({
    id: retailSales.id,
    saleNumber: retailSales.saleNumber,
    saleDate: retailSales.saleDate,
    total: retailSales.total,
    paymentMethod: retailSales.paymentMethod,
    paymentBreakdownJson: retailSales.paymentBreakdownJson,
    notes: retailSales.notes,
    status: retailSales.status,
  }).from(retailSales).where(where).orderBy(desc(retailSales.saleDate)).limit(ps).offset(offset);

  const orders = ordersRaw.map(({ paymentBreakdownJson, notes, ...o }) => ({
    ...o,
    paymentMethod: parsePaymentBreakdown({ paymentBreakdownJson, notes, paymentMethod: o.paymentMethod, total: o.total }).length > 1 ? 'split' : o.paymentMethod,
  }));

  const [{ total }] = await db.select({ total: count() }).from(retailSales).where(where);
  const totalRevenue = Number(summary?.total ?? 0);
  const totalOrders = Number(summary?.orders ?? 0);

  return {
    summary: { total: totalRevenue, orders: totalOrders, avgOrderValue: totalOrders > 0 ? round2(totalRevenue / totalOrders) : 0 },
    dailySales,
    topProducts,
    paymentMix,
    orders,
    ordersPagination: { total: Number(total), page: pg, pageSize: ps, pages: Math.ceil(Number(total) / ps) },
  };
}

export async function getPayablesAgingReport(tenantId: string, asOfDate?: string) {
  await markOverduePayableBills(tenantId);
  const db = await getDb();
  const today = asOfDate ?? new Date().toISOString().split('T')[0];

  const bills = await db.select({
    id: payableBills.id,
    billNumber: payableBills.billNumber,
    stockistConnectionId: payableBills.stockistConnectionId,
    billDate: payableBills.billDate,
    dueDate: payableBills.dueDate,
    total: payableBills.total,
    paidAmount: payableBills.paidAmount,
    status: payableBills.status,
    stockistName: payableBills.stockistName,
  }).from(payableBills)
    .where(and(
      eq(payableBills.tenantId, tenantId),
      inArray(payableBills.status, ['unpaid', 'partial']),
      sql`CAST(${payableBills.total} AS NUMERIC) > CAST(${payableBills.paidAmount} AS NUMERIC)`,
    ));

  const buckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
  const enriched = bills.map(b => {
    const due = b.dueDate ?? b.billDate;
    const ageDays = Math.max(0, Math.floor((new Date(today).getTime() - new Date(due).getTime()) / 86400000));
    const outstanding = Math.max(0, parseFloat(String(b.total)) - parseFloat(String(b.paidAmount ?? 0)));
    if (ageDays <= 0) buckets.current += outstanding;
    else if (ageDays <= 30) buckets.days30 += outstanding;
    else if (ageDays <= 60) buckets.days60 += outstanding;
    else if (ageDays <= 90) buckets.days90 += outstanding;
    else buckets.over90 += outstanding;
    return { ...b, ageDays, outstanding };
  });

  const byStockist = Object.values(
    enriched.reduce((acc, b) => {
      const key = b.stockistConnectionId ?? 'unknown';
      if (!acc[key]) acc[key] = { stockistName: b.stockistName ?? 'Unknown', outstanding: 0, billCount: 0 };
      acc[key].outstanding += b.outstanding;
      acc[key].billCount += 1;
      return acc;
    }, {} as Record<string, { stockistName: string; outstanding: number; billCount: number }>),
  ).sort((a, b) => b.outstanding - a.outstanding);

  return { asOfDate: today, buckets, bills: enriched, byStockist, totalOutstanding: enriched.reduce((s, b) => s + b.outstanding, 0) };
}

export async function getPharmacyGstReport(tenantId: string, month: string) {
  const db = await getDb();
  const monthStart = `${month}-01`;
  const monthEnd = monthStart.slice(0, 8) + String(new Date(parseInt(month.slice(0, 4)), parseInt(month.slice(5)), 0).getDate()).padStart(2, '0');

  const [outputGst] = await db.select({
    taxable: sql<number>`COALESCE(SUM(CAST(${retailSaleItems.lineTotal} AS NUMERIC) / (1 + CAST(${retailSaleItems.gstRate} AS NUMERIC) / 100)), 0)`,
    tax: sql<number>`COALESCE(SUM(CAST(${retailSaleItems.lineTotal} AS NUMERIC) - CAST(${retailSaleItems.lineTotal} AS NUMERIC) / (1 + CAST(${retailSaleItems.gstRate} AS NUMERIC) / 100)), 0)`,
  }).from(retailSaleItems)
    .innerJoin(retailSales, eq(retailSaleItems.saleId, retailSales.id))
    .where(and(
      eq(retailSales.tenantId, tenantId),
      eq(retailSales.status, 'completed'),
      gte(retailSales.saleDate, monthStart),
      lte(retailSales.saleDate, monthEnd),
    ));

  // C13: Pharmacy input GST comes from payable bills + their items, not the
  // stockist-side `purchases` tables.
  const [payableInput] = await db.select({
    cgst: sql<number>`COALESCE(SUM(CAST(${payableBillItems.cgst} AS NUMERIC)), 0)`,
    sgst: sql<number>`COALESCE(SUM(CAST(${payableBillItems.sgst} AS NUMERIC)), 0)`,
    igst: sql<number>`COALESCE(SUM(CAST(${payableBillItems.igst} AS NUMERIC)), 0)`,
    taxable: sql<number>`COALESCE(SUM(CAST(${payableBillItems.lineSubtotal} AS NUMERIC)), 0)`,
  }).from(payableBillItems)
    .innerJoin(payableBills, eq(payableBillItems.billId, payableBills.id))
    .where(and(
      eq(payableBills.tenantId, tenantId),
      gte(payableBills.billDate, monthStart),
      lte(payableBills.billDate, monthEnd),
    ));

  // Manual purchases (non-portal purchases entered locally) also contribute ITC
  const [localInput] = await db.select({
    taxable: sql<number>`COALESCE(SUM(CAST(${purchaseItems.lineSubtotal} AS NUMERIC)), 0)`,
    tax: sql<number>`COALESCE(SUM(CAST(${purchaseItems.lineTax} AS NUMERIC)), 0)`,
  }).from(purchaseItems)
    .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
    .where(and(
      eq(purchases.tenantId, tenantId),
      eq(purchases.status, 'received'),
      gte(purchases.receivedDate, monthStart),
      lte(purchases.receivedDate, monthEnd),
    ));

  const inputCgst = Number(payableInput?.cgst ?? 0);
  const inputSgst = Number(payableInput?.sgst ?? 0);
  const inputIgst = Number(payableInput?.igst ?? 0);
  const inputTaxFromPayables = inputCgst + inputSgst + inputIgst;
  const inputTaxFromLocal = Number(localInput?.tax ?? 0);
  const inputTax = inputTaxFromPayables + inputTaxFromLocal;
  const inputTaxable = Number(payableInput?.taxable ?? 0) + Number(localInput?.taxable ?? 0);

  const outputTax = Number(outputGst?.tax ?? 0);

  // byRate breakdown for outbound retail sales
  const byRateRows = await db.select({
    rate: retailSaleItems.gstRate,
    taxable: sql<number>`COALESCE(SUM(CAST(${retailSaleItems.lineTotal} AS NUMERIC) / (1 + CAST(${retailSaleItems.gstRate} AS NUMERIC) / 100)), 0)`,
    tax: sql<number>`COALESCE(SUM(CAST(${retailSaleItems.lineTotal} AS NUMERIC) - CAST(${retailSaleItems.lineTotal} AS NUMERIC) / (1 + CAST(${retailSaleItems.gstRate} AS NUMERIC) / 100)), 0)`,
  }).from(retailSaleItems)
    .innerJoin(retailSales, eq(retailSaleItems.saleId, retailSales.id))
    .where(and(
      eq(retailSales.tenantId, tenantId),
      eq(retailSales.status, 'completed'),
      gte(retailSales.saleDate, monthStart),
      lte(retailSales.saleDate, monthEnd),
    ))
    .groupBy(retailSaleItems.gstRate);

  return {
    month,
    outputGst: { taxable: round2(Number(outputGst?.taxable ?? 0)), tax: round2(outputTax) },
    inputGst: {
      taxable: round2(inputTaxable),
      tax: round2(inputTax),
      cgst: round2(inputCgst),
      sgst: round2(inputSgst),
      igst: round2(inputIgst),
    },
    netPayable: round2(outputTax - inputTax),
    byRate: byRateRows.map(r => ({
      rate: Number(r.rate),
      taxableValue: round2(Number(r.taxable)),
      tax: round2(Number(r.tax)),
    })).sort((a, b) => a.rate - b.rate),
  };
}

export async function getPharmacyProfitReport(tenantId: string, from: string, to: string) {
  const db = await getDb();

  const rows = await db.select({
    productId: retailSaleItems.productId,
    name: products.name,
    qty: sql<number>`COALESCE(SUM(${retailSaleItems.qty}), 0)`,
    revenue: sql<number>`COALESCE(SUM(CAST(${retailSaleItems.lineTotal} AS NUMERIC)), 0)`,
    cost: sql<number>`COALESCE(SUM(CAST(${productBatches.purchaseRate} AS NUMERIC) * ${retailSaleItems.qty}), 0)`,
  }).from(retailSaleItems)
    .innerJoin(retailSales, eq(retailSaleItems.saleId, retailSales.id))
    .leftJoin(products, eq(retailSaleItems.productId, products.id))
    .leftJoin(productBatches, eq(retailSaleItems.batchId, productBatches.id))
    .where(and(
      eq(retailSales.tenantId, tenantId),
      eq(retailSales.status, 'completed'),
      gte(retailSales.saleDate, from),
      lte(retailSales.saleDate, to),
    ))
    .groupBy(retailSaleItems.productId, products.name)
    .orderBy(desc(sql`COALESCE(SUM(CAST(${retailSaleItems.lineTotal} AS NUMERIC)), 0)`));

  const items = rows.map(r => {
    const revenue = Number(r.revenue ?? 0);
    const cost = Number(r.cost ?? 0);
    const profit = round2(revenue - cost);
    const margin = revenue > 0 ? round2((profit / revenue) * 100) : 0;
    return { ...r, revenue, cost, profit, margin };
  });

  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);
  const totalCost = items.reduce((s, i) => s + i.cost, 0);
  const totalProfit = round2(totalRevenue - totalCost);

  return { from, to, items, summary: { revenue: totalRevenue, cost: totalCost, profit: totalProfit, margin: totalRevenue > 0 ? round2((totalProfit / totalRevenue) * 100) : 0 } };
}

export async function getPharmacyComplianceReport(tenantId: string, scheduleType: string, month?: string) {
  const db = await getDb();
  const currentMonth = month ?? new Date().toISOString().slice(0, 7);
  const monthStart = `${currentMonth}-01`;
  const monthEnd = monthStart.slice(0, 8) + String(new Date(parseInt(currentMonth.slice(0, 4)), parseInt(currentMonth.slice(5)), 0).getDate()).padStart(2, '0');

  const scheduleFilter = scheduleType && scheduleType !== 'all'
    ? eq(products.scheduleType, scheduleType as 'H' | 'H1' | 'X' | 'NDPS' | 'NONE')
    : sql`${products.scheduleType} IN ('H', 'H1', 'X', 'NDPS')`;

  const rows = await db.select({
    saleNumber: retailSales.saleNumber,
    saleDate: retailSales.saleDate,
    rxNumber: retailSales.rxNumber,
    doctorName: retailSales.doctorName,
    doctorRegNo: retailSales.doctorRegNo,
    patientName: retailSales.patientName,
    patientAge: retailSales.patientAge,
    productName: products.name,
    scheduleType: products.scheduleType,
    qty: retailSaleItems.qty,
    batchNumber: productBatches.batchNumber,
    expiryDate: productBatches.expiryDate,
    total: retailSaleItems.lineTotal,
  }).from(retailSaleItems)
    .innerJoin(retailSales, eq(retailSaleItems.saleId, retailSales.id))
    .innerJoin(products, eq(retailSaleItems.productId, products.id))
    .leftJoin(productBatches, eq(retailSaleItems.batchId, productBatches.id))
    .where(and(
      eq(retailSales.tenantId, tenantId),
      eq(retailSales.status, 'completed'),
      gte(retailSales.saleDate, monthStart),
      lte(retailSales.saleDate, monthEnd),
      scheduleFilter,
    ))
    .orderBy(desc(retailSales.saleDate));

  return { month: currentMonth, scheduleType, entries: rows, total: rows.length };
}

export async function getPharmacyDashboardKpis(tenantId: string) {
  await markOverduePayableBills(tenantId);
  const db = await getDb();
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';

  const salesWhere = and(
    eq(retailSales.tenantId, tenantId),
    eq(retailSales.status, 'completed'),
  );

  const [todaySalesRow] = await db.select({
    total: sql<number>`COALESCE(SUM(CAST(${retailSales.total} AS NUMERIC)), 0)`,
  }).from(retailSales).where(and(salesWhere, eq(retailSales.saleDate, today)));

  const [monthSalesRow] = await db.select({
    total: sql<number>`COALESCE(SUM(CAST(${retailSales.total} AS NUMERIC)), 0)`,
  }).from(retailSales).where(and(salesWhere, gte(retailSales.saleDate, monthStart), lte(retailSales.saleDate, today)));

  const payablesOutstanding = await getPayablesOutstandingTotal(tenantId);

  const [pendingPos] = await db.select({ c: count() }).from(pharmacyPurchaseOrders)
    .where(and(
      eq(pharmacyPurchaseOrders.tenantId, tenantId),
      inArray(pharmacyPurchaseOrders.status, ['submitted', 'accepted']),
    ));

  const [awaitingGrn] = await db.select({ c: count() }).from(pharmacyPurchaseOrders)
    .where(and(
      eq(pharmacyPurchaseOrders.tenantId, tenantId),
      inArray(pharmacyPurchaseOrders.status, ['delivered', 'partially_received']),
    ));

  const lowStockRows = await db.select({
    id: products.id,
    stock: sql<number>`COALESCE(SUM(${productBatches.qtyOnHand}), 0)`,
    minStockLevel: products.minStockLevel,
  }).from(products)
    .leftJoin(productBatches, eq(products.id, productBatches.productId))
    .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)))
    .groupBy(products.id)
    .having(sql`COALESCE(SUM(${productBatches.qtyOnHand}), 0) < ${products.minStockLevel}`);

  const recentPos = await db.select({
    id: pharmacyPurchaseOrders.id,
    poNumber: pharmacyPurchaseOrders.poNumber,
    orderDate: pharmacyPurchaseOrders.orderDate,
    status: pharmacyPurchaseOrders.status,
    total: pharmacyPurchaseOrders.total,
  }).from(pharmacyPurchaseOrders)
    .where(eq(pharmacyPurchaseOrders.tenantId, tenantId))
    .orderBy(desc(pharmacyPurchaseOrders.createdAt))
    .limit(5);

  return {
    todaySales: Number(todaySalesRow?.total ?? 0),
    monthSales: Number(monthSalesRow?.total ?? 0),
    payablesOutstanding,
    pendingPos: Number(pendingPos?.c ?? 0),
    awaitingGrn: Number(awaitingGrn?.c ?? 0),
    lowStockCount: lowStockRows.length,
    recentPos,
  };
}
