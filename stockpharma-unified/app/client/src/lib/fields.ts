import { toNum } from './formatters';

/** Canonical money total from bill/purchase/order rows */
export function getTotal(row: { total?: string | number; totalAmount?: string | number; amount?: string | number } | null | undefined): number {
  if (!row) return 0;
  return toNum(row.total ?? row.totalAmount ?? row.amount);
}

/** Outstanding balance on a bill row */
export function getBalanceDue(bill: { balanceDue?: string | number; total?: string | number; totalAmount?: string | number; paidAmount?: string | number } | null | undefined): number {
  if (!bill) return 0;
  if (bill.balanceDue != null) return toNum(bill.balanceDue);
  const total = toNum(bill.total ?? bill.totalAmount);
  return Math.max(0, total - toNum(bill.paidAmount));
}

/** Line-item quantity (server uses `qty`) */
export function getQty(item: { qty?: string | number; quantity?: string | number; returnQty?: string | number } | null | undefined): number {
  if (!item) return 0;
  return toNum(item.qty ?? item.quantity ?? item.returnQty);
}

/** Pharmacy outstanding from list/detail rows */
export function getOutstanding(pharmacy: { outstanding?: string | number; outstandingBalance?: string | number } | null | undefined): number {
  if (!pharmacy) return 0;
  return toNum(pharmacy.outstanding ?? pharmacy.outstandingBalance);
}

/** Payment date from payment rows */
export function getPaymentDate(p: { paymentDate?: string; date?: string } | null | undefined): string | undefined {
  return p?.paymentDate ?? p?.date;
}

/** Human-readable payment label */
export function getPaymentNumber(p: { paymentNumber?: string; id?: string } | null | undefined): string {
  return p?.paymentNumber ?? p?.id ?? '—';
}

/** Stockist side of a pharmacy↔stockist connection row */
export function getConnectionStockistName(c: { stockistName?: string | null; businessName?: string | null; name?: string | null } | null | undefined): string {
  return c?.stockistName ?? c?.businessName ?? c?.name ?? '—';
}

export function getConnectionStockistGstin(c: { stockistGstin?: string | null; gstin?: string | null } | null | undefined): string {
  return c?.stockistGstin ?? c?.gstin ?? '—';
}

/** Pharmacy side of a connection row (stockist settings) */
export function getConnectionPharmacyName(c: { pharmacyName?: string | null; businessName?: string | null; name?: string | null } | null | undefined): string {
  return c?.pharmacyName ?? c?.businessName ?? c?.name ?? '—';
}

export function getConnectionPharmacyGstin(c: { pharmacyGstin?: string | null; gstin?: string | null } | null | undefined): string {
  return c?.pharmacyGstin ?? c?.gstin ?? '—';
}

/** Bill summary fields */
export function getBillSubtotal(bill: { subtotal?: string | number; totalTaxable?: string | number } | null | undefined): number {
  return toNum(bill?.subtotal ?? bill?.totalTaxable);
}

export function getBillCgst(bill: { cgst?: string | number; totalCgst?: string | number } | null | undefined): number {
  return toNum(bill?.cgst ?? bill?.totalCgst);
}

export function getBillSgst(bill: { sgst?: string | number; totalSgst?: string | number } | null | undefined): number {
  return toNum(bill?.sgst ?? bill?.totalSgst);
}

export function getBillIgst(bill: { igst?: string | number; totalIgst?: string | number } | null | undefined): number {
  return toNum(bill?.igst ?? bill?.totalIgst);
}

/** Line-item taxable / subtotal */
export function getLineSubtotal(item: { lineSubtotal?: string | number; taxable?: string | number } | null | undefined): number {
  return toNum(item?.lineSubtotal ?? item?.taxable);
}

/** Line-item total value */
export function getLineTotal(item: { lineTotal?: string | number; amount?: string | number; rate?: string | number; qty?: string | number; quantity?: string | number } | null | undefined): number {
  if (!item) return 0;
  if (item.lineTotal != null) return toNum(item.lineTotal);
  if (item.amount != null) return toNum(item.amount);
  return getQty(item) * toNum(item.rate);
}

/** Required-stock deficit from server */
export function getDeficit(item: { deficit?: number; shortage?: number; minStockLevel?: number; currentStock?: number } | null | undefined): number {
  if (!item) return 0;
  if (item.deficit != null) return item.deficit;
  if (item.shortage != null) return item.shortage;
  return Math.max(0, (item.minStockLevel ?? 0) - (item.currentStock ?? 0));
}
