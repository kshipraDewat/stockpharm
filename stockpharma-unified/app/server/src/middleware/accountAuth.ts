import { Request, Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';
import { env } from '../env.js';
import { getAuthTokenFromRequest } from '../lib/cookies.js';
import { getDb } from '../db/client.js';
import {
  users, tenants, platformUsers, consumerAccounts, doctorAccounts, mrAccounts,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { AuthPayload } from './auth.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);

async function verifyToken(req: Request): Promise<Record<string, unknown> | null> {
  const token = getAuthTokenFromRequest(req);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function authenticatePlatform(req: Request, res: Response, next: NextFunction) {
  const payload = await verifyToken(req);
  if (!payload?.sub) { res.status(401).json({ error: 'No token provided' }); return; }
  if (payload.accountKind !== 'platform') { res.status(403).json({ error: 'Platform access required' }); return; }
  const db = await getDb();
  const user = await db.query.platformUsers.findFirst({ where: eq(platformUsers.id, payload.sub as string) });
  if (!user?.isActive) { res.status(401).json({ error: 'Account inactive' }); return; }
  req.user = {
    sub: user.id,
    tenantId: 'platform',
    email: user.email,
    name: user.name,
    role: 'super_admin',
    tenantType: 'platform' as AuthPayload['tenantType'],
    accountKind: 'platform',
  } as AuthPayload;
  next();
}

export async function authenticateConsumer(req: Request, res: Response, next: NextFunction) {
  const payload = await verifyToken(req);
  if (!payload?.sub) { res.status(401).json({ error: 'No token provided' }); return; }
  if (payload.accountKind !== 'consumer') { res.status(403).json({ error: 'Consumer access required' }); return; }
  const db = await getDb();
  const user = await db.query.consumerAccounts.findFirst({ where: eq(consumerAccounts.id, payload.sub as string) });
  if (!user?.isActive) { res.status(401).json({ error: 'Account inactive' }); return; }
  req.user = {
    sub: user.id,
    tenantId: user.id,
    email: user.email,
    name: user.name,
    role: 'consumer',
    tenantType: 'consumer' as AuthPayload['tenantType'],
    accountKind: 'consumer',
  } as AuthPayload;
  next();
}

export async function authenticateDoctor(req: Request, res: Response, next: NextFunction) {
  const payload = await verifyToken(req);
  if (!payload?.sub) { res.status(401).json({ error: 'No token provided' }); return; }
  if (payload.accountKind !== 'doctor') { res.status(403).json({ error: 'Doctor access required' }); return; }
  const db = await getDb();
  const user = await db.query.doctorAccounts.findFirst({ where: eq(doctorAccounts.id, payload.sub as string) });
  if (!user?.isActive) { res.status(401).json({ error: 'Account inactive' }); return; }
  req.user = {
    sub: user.id,
    tenantId: user.id,
    email: user.email,
    name: user.name,
    role: 'doctor',
    tenantType: 'doctor' as AuthPayload['tenantType'],
    accountKind: 'doctor',
  } as AuthPayload;
  next();
}

export async function authenticateMr(req: Request, res: Response, next: NextFunction) {
  const payload = await verifyToken(req);
  if (!payload?.sub) { res.status(401).json({ error: 'No token provided' }); return; }
  if (payload.accountKind !== 'mr') { res.status(403).json({ error: 'MR access required' }); return; }
  const db = await getDb();
  const user = await db.query.mrAccounts.findFirst({ where: eq(mrAccounts.id, payload.sub as string) });
  if (!user?.isActive) { res.status(401).json({ error: 'Account inactive' }); return; }
  req.user = {
    sub: user.id,
    tenantId: user.id,
    email: user.email,
    name: user.name,
    role: 'mr',
    tenantType: 'mr' as AuthPayload['tenantType'],
    accountKind: 'mr',
  } as AuthPayload;
  next();
}

export async function authenticateAny(req: Request, res: Response, next: NextFunction) {
  const payload = await verifyToken(req);
  if (!payload?.sub) { res.status(401).json({ error: 'No token provided' }); return; }
  const kind = (payload.accountKind as string) ?? 'tenant';
  if (kind === 'platform') return authenticatePlatform(req, res, next);
  if (kind === 'consumer') return authenticateConsumer(req, res, next);
  if (kind === 'doctor') return authenticateDoctor(req, res, next);
  if (kind === 'mr') return authenticateMr(req, res, next);
  // fall through to tenant auth
  const db = await getDb();
  const userId = payload.sub as string;
  const tenantId = payload.tenantId as string;
  const user = await db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.tenantId, tenantId)) });
  if (!user?.isActive) { res.status(401).json({ error: 'Account inactive' }); return; }
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  req.user = {
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantType: (tenant?.tenantType ?? 'stockist') as AuthPayload['tenantType'],
    accountKind: 'tenant',
  };
  next();
}
