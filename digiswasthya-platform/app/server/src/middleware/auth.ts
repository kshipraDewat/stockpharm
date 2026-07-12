import { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';
import { env } from '../env.js';
import { getAuthTokenFromRequest } from '../lib/cookies.js';
import { getDb } from '../db/client.js';
import { users, tenants } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export interface AuthPayload {
  sub: string;
  tenantId: string;
  tenantType: 'stockist' | 'pharmacy' | 'platform' | 'consumer' | 'doctor' | 'mr';
  email: string;
  name: string;
  role: string;
  accountKind?: 'tenant' | 'platform' | 'consumer' | 'doctor' | 'mr';
}

declare global {
  namespace Express {
    interface Request {
      user: AuthPayload;
    }
  }
}

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.sub as string;
    const tenantId = payload.tenantId as string;
    if (!userId || !tenantId) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const db = await getDb();
    const user = await db.query.users.findFirst({
      where: and(eq(users.id, userId), eq(users.tenantId, tenantId)),
    });
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Account inactive or not found' });
      return;
    }

    const tokenIat = typeof payload.iat === 'number' ? payload.iat : 0;
    if (Math.floor(user.updatedAt.getTime() / 1000) > tokenIat) {
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
    req.user = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantType: (tenant?.tenantType ?? payload.tenantType ?? 'stockist') as AuthPayload['tenantType'],
      accountKind: (payload.accountKind as AuthPayload['accountKind']) ?? 'tenant',
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
