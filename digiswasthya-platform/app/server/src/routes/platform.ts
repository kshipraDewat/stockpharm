import { Router } from 'express';
import { z } from 'zod';
import { authenticatePlatform } from '../middleware/accountAuth.js';
import {
  loginPlatformUser, listTenants, getTenantDetail, setTenantApproval, getPlatformStats,
} from '../services/platformService.js';
import { setAuthCookie } from '../lib/cookies.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { env } from '../env.js';

const router = Router();
const authRateLimit = rateLimit({ windowMs: 60_000, max: env.NODE_ENV === 'development' ? 200 : 10 });

router.post('/login', authRateLimit, async (req, res, next) => {
  try {
    const { email, password } = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);
    const result = await loginPlatformUser(email, password);
    setAuthCookie(res, result.accessToken);
    res.json({ user: result.user });
  } catch (e) { next(e); }
});

router.get('/me', authenticatePlatform, (req, res) => {
  res.json({
    id: req.user.sub,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
    accountKind: 'platform',
  });
});

router.get('/stats', authenticatePlatform, async (_req, res, next) => {
  try {
    res.json(await getPlatformStats());
  } catch (e) { next(e); }
});

router.get('/tenants', authenticatePlatform, async (req, res, next) => {
  try {
    const approvalStatus = req.query.approvalStatus as string | undefined;
    const tenantType = req.query.tenantType as string | undefined;
    res.json(await listTenants({ approvalStatus, tenantType }));
  } catch (e) { next(e); }
});

router.get('/tenants/:id', authenticatePlatform, async (req, res, next) => {
  try {
    const detail = await getTenantDetail(req.params.id);
    if (!detail) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(detail);
  } catch (e) { next(e); }
});

router.patch('/tenants/:id/approval', authenticatePlatform, async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['approved', 'rejected']) }).parse(req.body);
    res.json(await setTenantApproval(req.params.id, status));
  } catch (e) { next(e); }
});

export default router;
