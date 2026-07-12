import { getDb } from '../db/client.js';
import { tenants, users, platformUsers } from '../db/schema.js';
import { eq, desc, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { issueAccessToken } from './userService.js';

export async function ensurePlatformAdmin(email: string, password: string, name: string) {
  const db = await getDb();
  const normalized = email.trim().toLowerCase();
  const existing = await db.query.platformUsers.findFirst({ where: eq(platformUsers.email, normalized) });
  if (existing) return;
  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(platformUsers).values({
    email: normalized,
    passwordHash,
    name,
    role: 'super_admin',
  });
}

export async function loginPlatformUser(email: string, password: string) {
  const db = await getDb();
  const normalized = email.trim().toLowerCase();
  const user = await db.query.platformUsers.findFirst({ where: eq(platformUsers.email, normalized) });
  if (!user || !user.isActive) throw new Error('Invalid credentials');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error('Invalid credentials');

  const accessToken = await issueAccessToken({
    id: user.id,
    tenantId: 'platform',
    email: user.email,
    name: user.name,
    role: 'super_admin',
    tenantType: 'platform' as any,
    accountKind: 'platform',
  } as any);

  return {
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'super_admin',
      accountKind: 'platform',
    },
  };
}

export async function listTenants(filters?: { approvalStatus?: string; tenantType?: string }) {
  const db = await getDb();
  let rows = await db.select().from(tenants).orderBy(desc(tenants.createdAt)).limit(200);
  if (filters?.approvalStatus) {
    rows = rows.filter((t) => (t as any).approvalStatus === filters.approvalStatus);
  }
  if (filters?.tenantType) {
    rows = rows.filter((t) => t.tenantType === filters.tenantType);
  }
  return rows;
}

export async function getTenantDetail(tenantId: string) {
  const db = await getDb();
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  if (!tenant) return null;
  const staff = await db.select().from(users).where(eq(users.tenantId, tenantId));
  return { tenant, staff };
}

export async function setTenantApproval(tenantId: string, status: 'approved' | 'rejected') {
  const db = await getDb();
  const [updated] = await db.update(tenants)
    .set({ approvalStatus: status, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
    .returning();
  return updated;
}

export async function getPlatformStats() {
  const db = await getDb();
  const allTenants = await db.select({ tenantType: tenants.tenantType }).from(tenants);
  const stockists = allTenants.filter((t) => t.tenantType === 'stockist').length;
  const pharmacies = allTenants.filter((t) => t.tenantType === 'pharmacy').length;
  const pending = await db.select({ count: sql<number>`count(*)` })
    .from(tenants)
    .where(eq(tenants.approvalStatus, 'pending'));
  return {
    totalTenants: allTenants.length,
    stockists,
    pharmacies,
    pendingApprovals: Number(pending[0]?.count ?? 0),
  };
}
