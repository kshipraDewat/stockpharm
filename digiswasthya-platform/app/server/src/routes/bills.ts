import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { listBills, getBillDetail } from '../services/billService.js';
import { recordPayment } from '../services/paymentService.js';
import { getDb } from '../db/client.js';
import { auditLogs, bills, pharmacies } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { round2 } from '../lib/gst.js';

const router = Router();
router.use(authenticate, requireTenantType('stockist'));

router.get('/', async (req, res, next) => {
  try {
    const { search, status, page, pageSize } = req.query as Record<string, string>;
    const result = await listBills(req.user.tenantId, { search, status, page: parseInt(page ?? '1'), pageSize: parseInt(pageSize ?? '20') });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const bill = await getBillDetail(req.user.tenantId, req.params.id);
    if (!bill) { res.status(404).json({ error: 'Bill not found' }); return; }
    res.json(bill);
  } catch (e) { next(e); }
});

/**
 * C5: bill status mutations now go through the payments flow so the ledger,
 * `payments`, and `payment_allocations` rows stay in sync with the bill
 * status / pharmacy.outstanding. Marking a bill paid produces a synthetic
 * cash payment for the remaining outstanding amount.
 */
router.patch('/:id/status', requireRole('admin', 'biller'), auditMiddleware('bill'), async (req, res, next) => {
  try {
    const body = z.object({
      status: z.enum(['unpaid', 'partial', 'paid']),
      notes: z.string().optional(),
      method: z.enum(['cash', 'upi', 'bank', 'cheque']).optional(),
      referenceNo: z.string().optional(),
    }).parse(req.body);
    const paidNote = body.notes?.trim();
    if (body.status === 'paid' && !paidNote) {
      res.status(400).json({ error: 'Notes are required when marking a bill as paid' });
      return;
    }

    const db = await getDb();
    const bill = await db.query.bills.findFirst({
      where: and(eq(bills.id, req.params.id), eq(bills.tenantId, req.user.tenantId)),
    });
    if (!bill) { res.status(404).json({ error: 'Bill not found' }); return; }

    const billTotal = parseFloat(bill.total);
    const currentPaid = parseFloat(bill.paidAmount);
    const outstanding = round2(billTotal - currentPaid);

    if (body.status === 'paid') {
      if (outstanding > 0) {
        const method = body.method ?? 'cash';
        if (method !== 'cash' && !body.referenceNo?.trim()) {
          res.status(400).json({ error: 'Reference number is required for non-cash payments' });
          return;
        }
        await recordPayment(req.user.tenantId, req.user.sub, {
          pharmacyId: bill.pharmacyId,
          paymentDate: new Date().toISOString().split('T')[0],
          method,
          referenceNo: body.referenceNo,
          amount: outstanding,
          notes: paidNote,
          allocations: [{ billId: bill.id, amount: outstanding }],
        });
      }
      // recordPayment will have flipped status to 'paid' via allocation logic.
      await db.insert(auditLogs).values({
        tenantId: req.user.tenantId,
        userId: req.user.sub ?? null,
        action: 'BILL_MARKED_PAID',
        entityType: 'bill',
        entityId: bill.id,
        beforeJson: JSON.stringify({ status: bill.status, paidAmount: bill.paidAmount }),
        afterJson: JSON.stringify({ status: 'paid', paidAmount: billTotal, notes: paidNote }),
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      const refreshed = await db.query.bills.findFirst({ where: eq(bills.id, bill.id) });
      res.json(refreshed);
      return;
    }

    if (body.status === 'unpaid') {
      if (currentPaid > 0) throw new Error('Cannot mark unpaid when payments have been applied');
      const [row] = await db.update(bills).set({ status: 'unpaid' })
        .where(and(eq(bills.id, req.params.id), eq(bills.tenantId, req.user.tenantId)))
        .returning();
      res.json(row);
      return;
    }

    // 'partial' is computed by recordPayment automatically — manual mutation not allowed.
    res.status(400).json({ error: 'Use the Record Payment flow to set partial status' });
  } catch (e) { next(e); }
});

export default router;
