import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/client.js';
import { auditLogs, products, bills, pharmacies, purchases, payments, users, tenants } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEYS = new Set(['passwordHash', 'accessToken', 'resetToken', 'refreshToken', 'token', 'password']);

function redactValue(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(redactValue);
  if (typeof obj !== 'object') return obj;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = SENSITIVE_KEYS.has(k) ? '[REDACTED]' : redactValue(v);
  }
  return result;
}

function safeJson(body: unknown): string | null {
  if (body === undefined) return null;
  try {
    return JSON.stringify(redactValue(body));
  } catch {
    return null;
  }
}

async function fetchBeforeState(entityType: string, tenantId: string, entityId: string): Promise<unknown | null> {
  const db = await getDb();
  switch (entityType) {
    case 'product':
      return db.query.products.findFirst({ where: and(eq(products.id, entityId), eq(products.tenantId, tenantId)) });
    case 'bill':
      return db.query.bills.findFirst({ where: and(eq(bills.id, entityId), eq(bills.tenantId, tenantId)) });
    case 'pharmacy':
      return db.query.pharmacies.findFirst({ where: and(eq(pharmacies.id, entityId), eq(pharmacies.tenantId, tenantId)) });
    case 'purchase':
      return db.query.purchases.findFirst({ where: and(eq(purchases.id, entityId), eq(purchases.tenantId, tenantId)) });
    case 'payment':
      return db.query.payments.findFirst({ where: and(eq(payments.id, entityId), eq(payments.tenantId, tenantId)) });
    case 'user':
      return db.query.users.findFirst({ where: and(eq(users.id, entityId), eq(users.tenantId, tenantId)) });
    case 'tenant':
      return db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
    default:
      return null;
  }
}

export function auditMiddleware(entityType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!MUTATING_METHODS.has(req.method)) { next(); return; }

    let beforeState: unknown = null;
    if ((req.method === 'PATCH' || req.method === 'PUT') && req.params.id && req.user) {
      try {
        beforeState = await fetchBeforeState(entityType, req.user.tenantId, req.params.id);
      } catch { /* non-fatal */ }
    } else if (req.method === 'PATCH' && entityType === 'tenant' && req.user) {
      try {
        beforeState = await fetchBeforeState('tenant', req.user.tenantId, req.user.tenantId);
      } catch { /* non-fatal */ }
    }

    const originalJson = res.json.bind(res);
    let responseBody: unknown;

    res.json = (body) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const tenantId = req.user?.tenantId
          ?? (responseBody && typeof responseBody === 'object'
            ? ((responseBody as Record<string, unknown>).user as Record<string, unknown> | undefined)?.tenantId as string | undefined
            : undefined);
        if (!tenantId) return;
        try {
          const db = await getDb();
          const entityId = responseBody && typeof responseBody === 'object'
            ? (responseBody as Record<string, unknown>).id as string | undefined
            : req.params.id;
          await db.insert(auditLogs).values({
            tenantId,
            userId: req.user?.sub ?? null,
            action: `${req.method} ${req.path}`,
            entityType,
            entityId,
            beforeJson: safeJson(beforeState),
            afterJson: safeJson(responseBody ?? req.body),
            ip: req.ip,
            userAgent: req.headers['user-agent'],
          });
        } catch (err) {
          console.error('[audit] Failed to write audit log:', err);
        }
      }
    });

    next();
  };
}
