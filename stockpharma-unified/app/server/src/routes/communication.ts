import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { sendBillViaWhatsApp } from '../services/whatsappService.js';
import { getBillDetail } from '../services/billService.js';
import { getDb } from '../db/client.js';
import { pharmacies, tenants } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { env } from '../env.js';

const router = Router();
router.use(authenticate);

router.post('/send-bill', async (req, res, next) => {
  try {
    if (!env.FEATURE_WHATSAPP) {
      res.status(403).json({
        error: 'WhatsApp sharing not enabled. Set FEATURE_WHATSAPP=true, WHATSAPP_TOKEN, and WHATSAPP_PHONE_ID in .env',
      });
      return;
    }

    const { billId, billPdfBase64 } = z.object({
      billId: z.string().uuid(),
      billPdfBase64: z.string(), // base64-encoded PDF from client
    }).parse(req.body);

    if (!billPdfBase64.trim()) {
      res.status(400).json({ error: 'Bill PDF is required' });
      return;
    }

    const bill = await getBillDetail(req.user.tenantId, billId);
    if (!bill) { res.status(404).json({ error: 'Bill not found' }); return; }

    const db = await getDb();
    const pharmacy = await db.query.pharmacies.findFirst({
      where: and(eq(pharmacies.id, bill.pharmacyId), eq(pharmacies.tenantId, req.user.tenantId)),
    });
    if (!pharmacy) { res.status(404).json({ error: 'Pharmacy not found' }); return; }
    if (!pharmacy.phone) { res.status(400).json({ error: 'Pharmacy has no phone number' }); return; }

    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, req.user.tenantId) });
    const senderName = tenant?.businessName ?? tenant?.name ?? 'Your supplier';

    const result = await sendBillViaWhatsApp(
      pharmacy.phone,
      pharmacy.name,
      bill.billNumber,
      billPdfBase64,
      senderName,
    );

    if (result.success) {
      res.json({ success: true, messageId: result.messageId });
    } else {
      res.status(502).json({ success: false, error: result.error });
    }
  } catch (e) { next(e); }
});

export default router;
