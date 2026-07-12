import { Router } from 'express';
import { z } from 'zod';
import {
  authenticateConsumer, authenticateDoctor, authenticateMr,
} from '../middleware/accountAuth.js';
import { extendedAccountService } from '../services/extendedAccountService.js';
import { setAuthCookie } from '../lib/cookies.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { env } from '../env.js';

const router = Router();
const authRateLimit = rateLimit({ windowMs: 60_000, max: env.NODE_ENV === 'development' ? 200 : 10 });

// ─── Consumer ───────────────────────────────────────────────────────────────
router.post('/consumer/register', authRateLimit, async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(2),
      phone: z.string().optional(),
    }).parse(req.body);
    const result = await extendedAccountService.registerConsumer(body);
    setAuthCookie(res, result.accessToken);
    res.json({ user: result.user });
  } catch (e) { next(e); }
});

router.post('/consumer/login', authRateLimit, async (req, res, next) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const result = await extendedAccountService.loginConsumer(email, password);
    setAuthCookie(res, result.accessToken);
    res.json({ user: result.user });
  } catch (e) { next(e); }
});

router.get('/consumer/pharmacies', async (_req, res, next) => {
  try { res.json(await extendedAccountService.listPharmaciesForConsumer()); } catch (e) { next(e); }
});

router.get('/consumer/pharmacies/:id/products', async (req, res, next) => {
  try { res.json(await extendedAccountService.listPharmacyProducts(req.params.id)); } catch (e) { next(e); }
});

router.get('/consumer/orders', authenticateConsumer, async (req, res, next) => {
  try { res.json(await extendedAccountService.listConsumerOrders(req.user.sub)); } catch (e) { next(e); }
});

router.post('/consumer/orders', authenticateConsumer, async (req, res, next) => {
  try {
    const body = z.object({
      pharmacyTenantId: z.string().uuid(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        productName: z.string(),
        qty: z.number().int().positive(),
        unitPrice: z.number().positive(),
        gstRate: z.number().optional(),
      })).min(1),
      paymentMode: z.enum(['cod', 'upi', 'online']).default('cod'),
      deliveryAddress: z.record(z.string()),
      notes: z.string().optional(),
      prescriptionUrl: z.string().optional(),
    }).parse(req.body);
    res.status(201).json(await extendedAccountService.placeOnlineOrder(req.user.sub, body));
  } catch (e) { next(e); }
});

router.get('/consumer/doctors', async (_req, res, next) => {
  try { res.json(await extendedAccountService.listDoctors()); } catch (e) { next(e); }
});

router.post('/consumer/consultations', authenticateConsumer, async (req, res, next) => {
  try {
    const body = z.object({
      doctorId: z.string().uuid(),
      mode: z.enum(['audio', 'video', 'clinic']),
      scheduledAt: z.string().optional(),
      pharmacyTenantId: z.string().uuid().optional(),
    }).parse(req.body);
    res.status(201).json(await extendedAccountService.bookConsultation(req.user.sub, body));
  } catch (e) { next(e); }
});

// ─── Doctor ─────────────────────────────────────────────────────────────────
router.post('/doctor/register', authRateLimit, async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(2),
      phone: z.string().optional(),
      specialization: z.string().optional(),
    }).parse(req.body);
    const result = await extendedAccountService.registerDoctor(body);
    setAuthCookie(res, result.accessToken);
    res.json({ user: result.user });
  } catch (e) { next(e); }
});

router.post('/doctor/login', authRateLimit, async (req, res, next) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const result = await extendedAccountService.loginDoctor(email, password);
    setAuthCookie(res, result.accessToken);
    res.json({ user: result.user });
  } catch (e) { next(e); }
});

router.get('/doctor/consultations', authenticateDoctor, async (req, res, next) => {
  try { res.json(await extendedAccountService.listDoctorConsultations(req.user.sub)); } catch (e) { next(e); }
});

// ─── MR ─────────────────────────────────────────────────────────────────────
router.post('/mr/register', authRateLimit, async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(2),
      phone: z.string().optional(),
      brand: z.string().optional(),
    }).parse(req.body);
    const result = await extendedAccountService.registerMr(body);
    setAuthCookie(res, result.accessToken);
    res.json({ user: result.user });
  } catch (e) { next(e); }
});

router.post('/mr/login', authRateLimit, async (req, res, next) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const result = await extendedAccountService.loginMr(email, password);
    setAuthCookie(res, result.accessToken);
    res.json({ user: result.user });
  } catch (e) { next(e); }
});

router.get('/mr/visits', authenticateMr, async (req, res, next) => {
  try { res.json(await extendedAccountService.listMrVisits(req.user.sub)); } catch (e) { next(e); }
});

router.post('/mr/visits', authenticateMr, async (req, res, next) => {
  try {
    const body = z.object({
      pharmacyName: z.string().min(2),
      phone: z.string().optional(),
      address: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    res.status(201).json(await extendedAccountService.recordMrVisit(req.user.sub, body));
  } catch (e) { next(e); }
});

export default router;
