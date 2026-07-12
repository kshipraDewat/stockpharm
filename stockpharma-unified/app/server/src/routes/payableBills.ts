import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { listPayableBills, getPayableBillDetail } from '../services/payableBillService.js';

const router = Router();
router.use(authenticate, requireTenantType('pharmacy'));

router.get('/', async (req, res, next) => {
  try {
    const { search, status, stockistConnectionId, from, to, page, pageSize } = req.query as Record<string, string>;
    const result = await listPayableBills(req.user.tenantId, {
      search, status, stockistConnectionId, from, to,
      page: parseInt(page ?? '1', 10),
      pageSize: parseInt(pageSize ?? '20', 10),
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await getPayableBillDetail(req.user.tenantId, req.params.id);
    if (!result) { res.status(404).json({ error: 'Payable bill not found' }); return; }
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
