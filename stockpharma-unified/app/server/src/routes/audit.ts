import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getDb } from '../db/client.js';
import { auditLogs, users } from '../db/schema.js';
import { eq, and, gte, lte, desc, count } from 'drizzle-orm';

const router = Router();
router.use(authenticate, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    const {
      action,
      entityType,
      userId,
      dateFrom,
      dateTo,
      from,
      to,
      page = '1',
      pageSize = '20',
    } = req.query as Record<string, string>;
    const db = await getDb();
    const pg = Math.max(1, parseInt(page));
    const ps = Math.min(100, parseInt(pageSize));
    const offset = (pg - 1) * ps;
    const fromRaw = dateFrom ?? from;
    const toRaw = dateTo ?? to;

    const fromDate = fromRaw ? new Date(fromRaw) : undefined;
    const toDate = toRaw ? new Date(toRaw) : undefined;
    if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
      toDate.setHours(23, 59, 59, 999);
    }

    const where = and(
      eq(auditLogs.tenantId, req.user.tenantId),
      action ? eq(auditLogs.action, action) : undefined,
      entityType ? eq(auditLogs.entityType, entityType) : undefined,
      userId ? eq(auditLogs.userId, userId) : undefined,
      fromDate && !Number.isNaN(fromDate.getTime()) ? gte(auditLogs.createdAt, fromDate) : undefined,
      toDate && !Number.isNaN(toDate.getTime()) ? lte(auditLogs.createdAt, toDate) : undefined,
    );

    const rows = await db.select({
      id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType,
      entityId: auditLogs.entityId, createdAt: auditLogs.createdAt,
      userName: users.name, ip: auditLogs.ip,
    }).from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(where).orderBy(desc(auditLogs.createdAt)).limit(ps).offset(offset);

    const [{ total }] = await db.select({ total: count() }).from(auditLogs).where(where);
    res.json({ data: rows, total: Number(total), page: pg, pageSize: ps, pages: Math.ceil(Number(total) / ps) });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    const log = await db.query.auditLogs.findFirst({ where: and(eq(auditLogs.id, req.params.id), eq(auditLogs.tenantId, req.user.tenantId)) });
    if (!log) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(log);
  } catch (e) { next(e); }
});

export default router;
