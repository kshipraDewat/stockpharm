import { Router } from 'express';
import { z } from 'zod';
import { registerTenant, loginUser, issueAccessToken, forgotPassword, resetPassword } from '../services/userService.js';
import { authenticate, type AuthPayload } from '../middleware/auth.js';
import { authenticateAny } from '../middleware/accountAuth.js';
import { auditMiddleware } from '../middleware/audit.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getDb } from '../db/client.js';
import { tenants } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { setAuthCookie, clearAuthCookie } from '../lib/cookies.js';
import { env } from '../env.js';

const router = Router();

const authRateLimit = rateLimit({ windowMs: 60_000, max: env.NODE_ENV === 'development' ? 200 : 5 });

const RegisterSchema = z.object({
  businessName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/),
  stateCode: z.string().regex(/^\d{2}$/),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  gstin: z.string().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/).optional().or(z.literal('')),
  dlNumber: z.string().optional(),
  tenantType: z.enum(['stockist', 'pharmacy']).optional().default('stockist'),
}).superRefine((data, ctx) => {
  if (data.tenantType === 'pharmacy' && (!data.dlNumber || data.dlNumber.trim().length < 3)) {
    ctx.addIssue({ code: 'custom', message: 'Drug License (DL) is required for pharmacy registration', path: ['dlNumber'] });
  }
});

function sendAuthResponse(res: import('express').Response, result: { accessToken: string; user: object }) {
  setAuthCookie(res, result.accessToken);
  res.json({ user: result.user });
}

// M46: rate-limit /register too; previously only login/forgot-password were gated.
router.post('/register', authRateLimit, auditMiddleware('auth'), async (req, res, next) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const result = await registerTenant({
      ...body,
      gstin: body.gstin || undefined,
      tenantType: body.tenantType,
    });
    sendAuthResponse(res, result);
  } catch (e) { next(e); }
});

const LoginSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1),
  tenantType: z.enum(['stockist', 'pharmacy']).optional(),
});

router.post('/login', authRateLimit, async (req, res, next) => {
  try {
    const { email, password, tenantType } = LoginSchema.parse(req.body);
    const result = await loginUser(email, password, tenantType);
    sendAuthResponse(res, result);
  } catch (e) { next(e); }
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

router.get('/me', authenticateAny, async (req, res, next) => {
  try {
    const kind = req.user.accountKind ?? 'tenant';
    if (kind !== 'tenant') {
      res.json({
        id: req.user.sub,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        tenantType: req.user.tenantType,
        accountKind: kind,
      });
      return;
    }
    const db = await getDb();
    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, req.user.tenantId) });
    res.json({
      id: req.user.sub,
      tenantId: req.user.tenantId,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      tenantType: tenant?.tenantType ?? req.user.tenantType ?? 'stockist',
      accountKind: 'tenant',
      onboardingCompleted: tenant?.onboardingCompleted ?? false,
      onboardingStep: tenant?.onboardingStep ?? 0,
      approvalStatus: (tenant as any)?.approvalStatus ?? 'approved',
    });
  } catch (e) { next(e); }
});

router.post('/forgot-password', authRateLimit, async (req, res, next) => {
  try {
    const { email, tenantType } = z.object({
      email: z.string().email(),
      tenantType: z.enum(['stockist', 'pharmacy']).optional(),
    }).parse(req.body);
    const result = await forgotPassword(email, tenantType);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/reset-password', authRateLimit, auditMiddleware('auth'), async (req, res, next) => {
  try {
    const { token, password } = z.object({
      token: z.string().min(1),
      password: z.string().min(8).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/),
    }).parse(req.body);
    const result = await resetPassword(token, password);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
