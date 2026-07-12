import { getDb } from '../db/client.js';
import { purchases, purchaseItems, suppliers, products } from '../db/schema.js';
import { eq, and, desc, count, or, ilike, gte, lte, inArray } from 'drizzle-orm';
import { receiveStock } from '../lib/inventory.js';
import { postEntry } from '../lib/ledger.js';
import { nextGrnNumber } from '../lib/ids.js';
import { round2 } from '../lib/gst.js';
import { LEDGER_ACCOUNT_CODES } from '../../../shared/constants.js';

type PurchaseLineInput = {
  productId?: string;
  productName?: string;
  category?: string;
  batchNumber: string;
  expiryDate: string;
  qty: number;
  freeQty: number;
  mrp: number;
  purchaseRate: number;
  gstRate: number;
};

async function findOrCreateProductFromLine(
  tenantId: string,
  item: PurchaseLineInput,
  db: Awaited<ReturnType<typeof getDb>>,
) {
  if (item.productId) {
    const existing = await db.query.products.findFirst({
      where: and(eq(products.id, item.productId), eq(products.tenantId, tenantId)),
    });
    if (!existing) throw new Error('One or more products not found');
    return existing;
  }

  const name = item.productName?.trim();
  if (!name) throw new Error('Each line needs a product or new product name');

  const match = await db.query.products.findFirst({
    where: and(eq(products.tenantId, tenantId), ilike(products.name, name)),
  });
  if (match) return match;

  const [created] = await db.insert(products).values({
    tenantId,
    name,
    category: item.category?.trim() || 'General',
    gstRate: String(item.gstRate),
    mrp: String(item.mrp),
    purchaseRate: String(item.purchaseRate),
    saleRate: '0',
    minStockLevel: 10,
    isActive: true,
  }).returning();

  return created;
}

export async function createPurchase(tenantId: string, userId: string, body: {
  supplierId: string; supplierInvoiceNo?: string; invoiceDate?: string; notes?: string;
  invoiceFileUrl?: string;
  items: PurchaseLineInput[];
}) {
  const db = await getDb();
  const supplier = await db.query.suppliers.findFirst({ where: and(eq(suppliers.id, body.supplierId), eq(suppliers.tenantId, tenantId)) });
  if (!supplier) throw new Error('Supplier not found');

  const resolvedProducts = await Promise.all(body.items.map(i => findOrCreateProductFromLine(tenantId, i, db)));

  let subtotal = 0, taxAmount = 0;
  const itemCalcs = body.items.map((i, idx) => {
    const lineSub = round2(i.purchaseRate * i.qty);
    const lineTax = round2(lineSub * i.gstRate / 100);
    subtotal += lineSub; taxAmount += lineTax;
    return { ...i, productId: resolvedProducts[idx].id, lineSub, lineTax, lineTotal: round2(lineSub + lineTax) };
  });

  const grnNumber = await nextGrnNumber(tenantId);
  const [purchase] = await db.insert(purchases).values({
    tenantId, supplierId: body.supplierId, grnNumber, supplierInvoiceNo: body.supplierInvoiceNo,
    invoiceDate: body.invoiceDate, notes: body.notes, createdBy: userId,
    subtotal: round2(subtotal).toString(), taxAmount: round2(taxAmount).toString(),
    total: round2(subtotal + taxAmount).toString(), status: 'pending',
    invoiceFileUrl: body.invoiceFileUrl,
  }).returning();

  for (const item of itemCalcs) {
    await db.insert(purchaseItems).values({
      purchaseId: purchase.id, tenantId, productId: item.productId,
      batchNumber: item.batchNumber, expiryDate: item.expiryDate,
      qty: item.qty, freeQty: item.freeQty, mrp: item.mrp.toString(),
      purchaseRate: item.purchaseRate.toString(), gstRate: item.gstRate.toString(),
      lineSubtotal: item.lineSub.toString(), lineTax: item.lineTax.toString(), lineTotal: item.lineTotal.toString(),
    });
  }

  const needsSaleRate = resolvedProducts
    .filter((p, idx, arr) => parseFloat(p.saleRate) <= 0 && arr.findIndex(x => x.id === p.id) === idx)
    .map(p => ({
      id: p.id,
      name: p.name,
      mrp: parseFloat(p.mrp),
      purchaseRate: parseFloat(p.purchaseRate),
      saleRate: parseFloat(p.saleRate),
    }));

  return { ...purchase, productsNeedingSaleRate: needsSaleRate };
}

export async function setProductSaleRates(
  tenantId: string,
  rates: { productId: string; saleRate: number }[],
) {
  const db = await getDb();
  const updated: string[] = [];
  for (const row of rates) {
    if (row.saleRate <= 0) throw new Error(`Sale rate required for product ${row.productId}`);
    const [product] = await db.update(products)
      .set({ saleRate: String(row.saleRate) })
      .where(and(eq(products.id, row.productId), eq(products.tenantId, tenantId)))
      .returning({ id: products.id });
    if (product) updated.push(product.id);
  }
  return { updated };
}

export async function receivePurchase(tenantId: string, purchaseId: string, userId: string, opts?: { receivedDate?: string }) {
  const db = await getDb();
  const purchase = await db.query.purchases.findFirst({ where: and(eq(purchases.id, purchaseId), eq(purchases.tenantId, tenantId)) });
  if (!purchase) throw new Error('Purchase not found');
  if (purchase.status === 'received') throw new Error('Purchase already received');

  const items = await db.select().from(purchaseItems).where(eq(purchaseItems.purchaseId, purchaseId));
  const supplier = await db.query.suppliers.findFirst({ where: eq(suppliers.id, purchase.supplierId) });

  const missingRates = await db.select({ name: products.name })
    .from(purchaseItems)
    .innerJoin(products, eq(products.id, purchaseItems.productId))
    .where(and(
      eq(purchaseItems.purchaseId, purchaseId),
      eq(products.tenantId, tenantId),
      lte(products.saleRate, '0'),
    ));
  if (missingRates.length > 0) {
    throw new Error(`Set sale rates before receiving: ${missingRates.map(r => r.name).join(', ')}`);
  }

  return db.transaction(async (tx) => {
    for (const item of items) {
      const product = await tx.query.products.findFirst({
        where: and(eq(products.id, item.productId), eq(products.tenantId, tenantId)),
      });
      if (!product) throw new Error('Product not found for purchase item');
      await receiveStock(
        tenantId, item.productId, purchase.supplierId, purchaseId,
        item.batchNumber, item.expiryDate,
        parseFloat(item.mrp), parseFloat(item.purchaseRate),
        parseFloat(product.saleRate),
        item.qty, item.freeQty,
        { refNumber: purchase.grnNumber ?? undefined, performedBy: userId },
        tx as any,
      );
    }

    const receivedDate = opts?.receivedDate ?? new Date().toISOString().split('T')[0];
    await tx.update(purchases).set({ status: 'received', receivedDate }).where(eq(purchases.id, purchaseId));

    const subtotal = parseFloat(purchase.subtotal);
    const taxAmount = parseFloat(purchase.taxAmount);
    const total = parseFloat(purchase.total);
    const sellerState = supplier?.stateCode ?? '27';
    const buyerState = '08';
    const isInterstate = sellerState !== buyerState;

    await postEntry({
      tenantId, txnDate: receivedDate, refType: 'purchase', refId: purchaseId,
      narration: `Purchase from ${supplier?.name} | ${purchase.grnNumber}`, createdBy: userId,
      lines: [
        { accountCode: LEDGER_ACCOUNT_CODES.INVENTORY, debit: subtotal },
        ...(isInterstate
          ? [{ accountCode: LEDGER_ACCOUNT_CODES.IGST_INPUT, debit: taxAmount }]
          : [
              { accountCode: LEDGER_ACCOUNT_CODES.CGST_INPUT, debit: round2(taxAmount / 2) },
              { accountCode: LEDGER_ACCOUNT_CODES.SGST_INPUT, debit: round2(taxAmount / 2) },
            ]
        ),
        { accountCode: LEDGER_ACCOUNT_CODES.SUNDRY_CREDITORS, partnerType: 'supplier', partnerId: purchase.supplierId, credit: total },
      ],
    }, tx as any);

    return tx.query.purchases.findFirst({ where: eq(purchases.id, purchaseId) });
  });
}

export async function listPurchases(tenantId: string, params: {
  supplierId?: string; status?: string; search?: string;
  dateFrom?: string; dateTo?: string;
  page?: number; pageSize?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;
  const searchPattern = params.search ? `%${params.search}%` : undefined;

  const where = and(
    eq(purchases.tenantId, tenantId),
    params.supplierId ? eq(purchases.supplierId, params.supplierId) : undefined,
    params.status ? eq(purchases.status, params.status as any) : undefined,
    params.dateFrom ? gte(purchases.invoiceDate, params.dateFrom) : undefined,
    params.dateTo ? lte(purchases.invoiceDate, params.dateTo) : undefined,
    searchPattern
      ? or(
          ilike(purchases.grnNumber, searchPattern),
          ilike(purchases.supplierInvoiceNo, searchPattern),
          ilike(suppliers.name, searchPattern),
        )
      : undefined,
  );

  const rows = await db.select({
    id: purchases.id, grnNumber: purchases.grnNumber, supplierInvoiceNo: purchases.supplierInvoiceNo,
    invoiceDate: purchases.invoiceDate, total: purchases.total, status: purchases.status,
    supplierId: purchases.supplierId, supplierName: suppliers.name, createdAt: purchases.createdAt,
  }).from(purchases)
    .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(where).orderBy(desc(purchases.createdAt)).limit(pageSize).offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(purchases)
    .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(where);
  return { data: rows, total: Number(total), page, pageSize, pages: Math.ceil(Number(total) / pageSize) };
}
