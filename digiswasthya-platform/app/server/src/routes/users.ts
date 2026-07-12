import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { listUsers, createUser, changePassword, issueAccessToken } from '../services/userService.js';
import { setAuthCookie } from '../lib/cookies.js';
import { getDb } from '../db/client.js';
import { users, tenants } from '../db/schema.js';
import { eq, and, count } from 'drizzle-orm';

const router = Router();
router.use(authenticate);

const STOCKIST_ROLES = ['admin', 'biller'] as const;
const PHARMACY_ROLES = ['admin', 'pharmacist', 'cashier'] as const;

async function getTenantRoles(tenantId: string): Promise<readonly ('admin' | 'biller' | 'pharmacist' | 'cashier')[]> {
  const db = await getDb();
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  return tenant?.tenantType === 'pharmacy' ? PHARMACY_ROLES : STOCKIST_ROLES;
}

router.get('/', requireRole('admin'), async (req, res, next) => {
  try { res.json(await listUsers(req.user.tenantId)); } catch (e) { next(e); }
});

router.post('/', requireRole('admin'), auditMiddleware('user'), async (req, res, next) => {
  try {
    const allowedRoles = await getTenantRoles(req.user.tenantId);
    // M49: align admin-created-user password policy with registration / change-password.
    // M50: normalise email so the unique index and login lookup match.
    const body = z.object({
      email: z.string().email().transform(s => s.trim().toLowerCase()),
      name: z.string().min(2),
      role: z.enum(allowedRoles as [typeof allowedRoles[number], ...typeof allowedRoles[number][]]),
      password: z.string().min(8).regex(/[A-Z]/, 'must include an uppercase letter').regex(/[a-z]/, 'must include a lowercase letter').regex(/\d/, 'must include a digit'),
    }).parse(req.body);
    const result = await createUser(req.user.tenantId, body as { email: string; name: string; role: 'admin' | 'biller' | 'pharmacist' | 'cashier'; password: string });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('admin'), auditMiddleware('user'), async (req, res, next) => {
  try {
    const allowedRoles = await getTenantRoles(req.user.tenantId);
    const body = z.object({
      name: z.string().optional(),
      role: z.enum(allowedRoles as [string, ...string[]]).optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);
    const db = await getDb();
    const target = await db.query.users.findFirst({
      where: and(eq(users.id, req.params.id), eq(users.tenantId, req.user.tenantId)),
    });
    if (!target) { res.status(404).json({ error: 'Not found' }); return; }

    // C16: own-account guards apply for both deactivation and role demotion.
    const isSelf = req.params.id === req.user.sub;
    if (isSelf && body.isActive === false) {
      res.status(400).json({ error: 'You cannot deactivate your own account' });
      return;
    }
    if (isSelf && body.role && body.role !== 'admin') {
      res.status(400).json({ error: 'You cannot demote your own admin role' });
      return;
    }

    // M52: last-admin protection now covers role demotion too.
    const losingAdmin =
      (body.isActive === false && target.role === 'admin') ||
      (target.role === 'admin' && body.role && body.role !== 'admin');
    if (losingAdmin) {
      const [{ total: activeAdmins }] = await db.select({ total: count() }).from(users)
        .where(and(eq(users.tenantId, req.user.tenantId), eq(users.role, 'admin'), eq(users.isActive, true)));
      if (Number(activeAdmins) <= 1) {
        res.status(400).json({ error: 'Cannot remove the last active admin' });
        return;
      }
    }

    const [row] = await db.update(users).set({ ...body as any, updatedAt: new Date() }).where(and(eq(users.id, req.params.id), eq(users.tenantId, req.user.tenantId))).returning();
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }

    // M51: revoke active sessions / refresh tokens on deactivation.
    if (body.isActive === false) {
      try {
        const { revokeUserTokens } = await import('../services/userService.js');
        await revokeUserTokens(row.id);
      } catch (e) { console.error('[revokeUserTokens]', e); }
    }
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/change-password', auditMiddleware('user'), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/),
    }).parse(req.body);
    await changePassword(req.user.sub, currentPassword, newPassword);
    const accessToken = await issueAccessToken({
      id: req.user.sub,
      tenantId: req.user.tenantId,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      tenantType: req.user.tenantType ?? 'stockist',
    });
    setAuthCookie(res, accessToken);
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
