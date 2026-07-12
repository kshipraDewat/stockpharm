import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import { getDb } from '../db/client.js';
import { tenants, pharmacies as pharmacyTbl, products as productTbl, stockistConnections } from '../db/schema.js';
import { eq, and, count } from 'drizzle-orm';
import { env } from '../env.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import {
  syncPublicCatalog,
  getPublicCatalogSettings,
  setProductPublicVisibility,
} from '../services/publicCatalogService.js';

// M48: reuse registration's strict regex/format validators on every tenant write.
const GstinRegex = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const PhoneRegex = /^[6-9]\d{9}$/;
const StateCodeRegex = /^\d{2}$/;

const router = Router();
router.use(authenticate);

router.get('/features', (_req, res) => {
  res.json({
    whatsapp: env.FEATURE_WHATSAPP,
    aiParse: env.FEATURE_AI_PARSE,
    whatsappConfigured: Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID),
  });
});

router.get('/tenant', async (req, res, next) => {
  try {
    const db = await getDb();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, req.user.tenantId));
    if (!tenant) { res.status(404).json({ error: 'Tenant not found' }); return; }
    if (req.user.role !== 'admin') {
      const { inviteCode, ...rest } = tenant;
      res.json(rest);
      return;
    }
    res.json(tenant);
  } catch (e) { next(e); }
});

router.patch('/tenant', requireRole('admin'), auditMiddleware('tenant'), async (req, res, next) => {
  try {
    const body = z.object({
      businessName: z.string().min(2).optional(),
      // M48: enforce GSTIN/phone/state-code formats; empty string → null
      gstin: z.string().regex(GstinRegex).optional().nullable().or(z.literal('')),
      dlNumber: z.string().optional().nullable(),
      stateCode: z.string().regex(StateCodeRegex).optional(),
      phone: z.string().regex(PhoneRegex).optional(),
      email: z.string().email().transform(s => s.trim().toLowerCase()).optional(),
      addressJson: z.string().optional().nullable(),
      notificationsJson: z.string().optional().nullable(),
      isPubliclyListed: z.boolean().optional(),
      acceptingNewConnections: z.boolean().optional(),
      publicSlug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/).optional().nullable(),
      aboutText: z.string().max(2000).optional().nullable(),
      coverageStateCodes: z.string().optional().nullable(),
      categories: z.string().optional().nullable(),
      logoUrl: z.string().url().optional().nullable(),
    }).strict().parse(req.body);

    // me37: drop stockist-only marketing fields when the caller is a pharmacy.
    if (req.user.tenantType !== 'stockist') {
      delete (body as any).isPubliclyListed;
      delete (body as any).acceptingNewConnections;
      delete (body as any).publicSlug;
      delete (body as any).aboutText;
      delete (body as any).coverageStateCodes;
      delete (body as any).categories;
      delete (body as any).logoUrl;
    }

    // Normalise empty-string gstin to null.
    if ((body as any).gstin === '') (body as any).gstin = null;

    const db = await getDb();
    let updated;
    try {
      [updated] = await db.update(tenants).set(body as any).where(eq(tenants.id, req.user.tenantId)).returning();
    } catch (e: any) {
      // me38: slug-collision → 409 not 500
      if (e?.code === '23505') {
        res.status(409).json({ error: 'That value is already in use' });
        return;
      }
      throw e;
    }
    if (!updated) { res.status(404).json({ error: 'Tenant not found' }); return; }
    if (req.user.tenantType === 'stockist') {
      const { syncPublicCatalog } = await import('../services/publicCatalogService.js');
      await syncPublicCatalog(req.user.tenantId).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// M47: admin-only + audited + enforces minimum-setup gates on onboardingCompleted.
router.patch('/onboarding', requireRole('admin'), auditMiddleware('tenant'), async (req, res, next) => {
  try {
    const body = z.object({
      onboardingStep: z.number().int().min(0).max(10).optional(),
      onboardingCompleted: z.boolean().optional(),
      dlNumber: z.string().optional(),
      gstin: z.string().regex(GstinRegex).optional().nullable().or(z.literal('')),
      addressJson: z.string().optional().nullable(),
      businessName: z.string().min(2).optional(),
      phone: z.string().regex(PhoneRegex).optional(),
    }).strict().parse(req.body);
    const db = await getDb();
    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, req.user.tenantId) });
    if (!tenant) { res.status(404).json({ error: 'Tenant not found' }); return; }

    // me23: backward writes / out-of-range after completion → reject.
    const MAX_STEP = 4;
    if (body.onboardingStep !== undefined) {
      if (body.onboardingStep > MAX_STEP) {
        res.status(400).json({ error: 'Onboarding step out of range' });
        return;
      }
      if (tenant.onboardingCompleted && body.onboardingStep < tenant.onboardingStep) {
        res.status(400).json({ error: 'Cannot move onboarding backwards after completion' });
        return;
      }
    }

    const { onboardingStep, onboardingCompleted, ...tenantFields } = body;
    const updates: Record<string, unknown> = {};
    if (onboardingStep !== undefined) updates.onboardingStep = onboardingStep;

    // tenant-field writes always require admin (route already enforces it).
    if (tenantFields.dlNumber !== undefined) updates.dlNumber = tenantFields.dlNumber;
    if (tenantFields.gstin !== undefined) updates.gstin = tenantFields.gstin === '' ? null : tenantFields.gstin;
    if (tenantFields.addressJson !== undefined) updates.addressJson = tenantFields.addressJson;
    if (tenantFields.businessName !== undefined) updates.businessName = tenantFields.businessName;
    if (tenantFields.phone !== undefined) updates.phone = tenantFields.phone;

    if (onboardingCompleted === true) {
      // Compute the effective tenant snapshot (pending + this batch's writes).
      const merged = { ...tenant, ...updates };
      const missing: string[] = [];
      if (!merged.dlNumber || (merged.dlNumber as string).trim().length < 3) missing.push('Drug License (DL) number');
      if (tenant.tenantType === 'stockist') {
        const [{ c: pharmCount }] = await db.select({ c: count() }).from(pharmacyTbl)
          .where(eq(pharmacyTbl.tenantId, req.user.tenantId));
        const [{ c: prodCount }] = await db.select({ c: count() }).from(productTbl)
          .where(and(eq(productTbl.tenantId, req.user.tenantId), eq(productTbl.isActive, true)));
        if (Number(pharmCount) === 0) missing.push('at least one pharmacy customer');
        if (Number(prodCount) === 0) missing.push('at least one active product');
      } else {
        const [{ c: connCount }] = await db.select({ c: count() }).from(stockistConnections)
          .where(and(eq(stockistConnections.pharmacyTenantId, req.user.tenantId), eq(stockistConnections.status, 'active')));
        if (Number(connCount) === 0) missing.push('at least one active stockist connection');
      }
      if (missing.length > 0) {
        res.status(400).json({ error: 'Onboarding cannot be completed yet', missing });
        return;
      }
      updates.onboardingCompleted = true;
    } else if (onboardingCompleted === false) {
      updates.onboardingCompleted = false;
    }

    const [updated] = await db.update(tenants).set(updates).where(eq(tenants.id, req.user.tenantId)).returning();
    if (!updated) { res.status(404).json({ error: 'Tenant not found' }); return; }
    res.json(updated);
  } catch (e) { next(e); }
});

router.get('/public-catalog', requireTenantType('stockist'), requireRole('admin'), async (req, res, next) => {
  try {
    const items = await getPublicCatalogSettings(req.user.tenantId);
    res.json({ data: items });
  } catch (e) { next(e); }
});

router.post('/public-catalog/sync', requireTenantType('stockist'), requireRole('admin'), async (req, res, next) => {
  try {
    const result = await syncPublicCatalog(req.user.tenantId);
    res.json(result);
  } catch (e) { next(e); }
});

router.patch('/public-catalog/:productId', requireTenantType('stockist'), requireRole('admin'), async (req, res, next) => {
  try {
    const { isPublic } = z.object({ isPublic: z.boolean() }).parse(req.body);
    const result = await setProductPublicVisibility(req.user.tenantId, req.params.productId, isPublic);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
