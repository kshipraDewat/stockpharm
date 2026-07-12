import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { parseSmartOrder, recommendSmartOrder } from '../services/smartOrderService.js';

const router = Router();
router.use(authenticate, requireTenantType('pharmacy'));

router.post('/parse', async (req, res, next) => {
  try {
    const { rawText } = z.object({ rawText: z.string().min(1) }).parse(req.body);
    res.json(await parseSmartOrder(req.user.tenantId, rawText));
  } catch (e) { next(e); }
});

router.post('/recommend', async (req, res, next) => {
  try {
    const { sessionId } = z.object({ sessionId: z.string().uuid() }).parse(req.body);
    res.json(await recommendSmartOrder(req.user.tenantId, sessionId));
  } catch (e) { next(e); }
});

export default router;
