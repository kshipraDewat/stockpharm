import { getDb } from '../db/client.js';
import { bills, tenants, pharmacies } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Public bill verification (UNIFIED_FEATURES: "public bill verification at
 * /verify-bill/{id}"; closes the backend half of STOCKIST-PHARMACY §14
 * "Bill QR verification — Missing"). Returns only non-sensitive fields a bill
 * QR / recipient can use to confirm authenticity — no PTR, no line items,
 * no financial internals beyond the printed total.
 * Server-only — exposed at GET /api/public/verify-bill/:id. No UI changes.
 */
export interface BillVerification {
  verified: boolean;
  billNumber: string;
  billDate: string;
  total: string;
  status: string;
  stockistName: string;
  pharmacyName: string;
}

export async function verifyBill(id: string): Promise<BillVerification | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const bill = await db.query.bills.findFirst({ where: eq(bills.id, id) });
  if (!bill) return null;
  const stockist = await db.query.tenants.findFirst({ where: eq(tenants.id, bill.tenantId) });
  const pharmacy = await db.query.pharmacies.findFirst({ where: eq(pharmacies.id, bill.pharmacyId) });
  return {
    verified: true,
    billNumber: bill.billNumber,
    billDate: bill.billDate,
    total: bill.total,
    status: bill.status,
    stockistName: stockist?.businessName ?? 'Unknown',
    pharmacyName: pharmacy?.name ?? 'Unknown',
  };
}
