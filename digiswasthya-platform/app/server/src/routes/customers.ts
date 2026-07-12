import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireTenantType } from '../middleware/requireTenantType.js';
import { requireRole } from '../middleware/requireRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import {
  listCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer,
} from '../services/customerService.js';

const router = Router();
router.use(authenticate, requireTenantType('pharmacy'));

router.get('/', async (req, res, next) => {
  try {
    const { search, page, pageSize } = req.query as Record<string, string>;
    const result = await listCustomers(req.user.tenantId, {
      search,
      page: parseInt(page ?? '1', 10),
      pageSize: parseInt(pageSize ?? '20', 10),
    });
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await getCustomer(req.user.tenantId, req.params.id);
    if (!result) { res.status(404).json({ error: 'Customer not found' }); return; }
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/', requireRole('admin', 'pharmacist', 'cashier'), auditMiddleware('customer'), async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      age: z.number().int().positive().optional(),
      gender: z.string().optional(),
      allergies: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const result = await createCustomer(req.user.tenantId, body);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.patch('/:id', requireRole('admin', 'pharmacist'), auditMiddleware('customer'), async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1).optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      age: z.number().int().positive().optional(),
      gender: z.string().optional(),
      allergies: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const result = await updateCustomer(req.user.tenantId, req.params.id, body);
    res.json(result);
  } catch (e) { next(e); }
});

router.delete('/:id', requireRole('admin'), auditMiddleware('customer'), async (req, res, next) => {
  try {
    const result = await deleteCustomer(req.user.tenantId, req.params.id);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
