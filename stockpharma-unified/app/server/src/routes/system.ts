import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

router.get('/health', async (req, res) => {
  res.json({ status: 'ok', tenantId: req.user.tenantId });
});

export default router;
