import { getDb } from '../db/client.js';
import { users, tenants, passwordResetTokens, refreshTokens } from '../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.js';
import { seedLedgerAccounts } from '../lib/ledger.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);

import { generateInviteCode } from '../lib/inviteCode.js';

export async function issueAccessToken(user: {
  id: string; tenantId: string; email: string; name: string; role: string;
  tenantType?: string; accountKind?: string;
}) {
  return new SignJWT({
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantType: user.tenantType ?? 'stockist',
    accountKind: user.accountKind ?? 'tenant',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(secret);
}

export async function revokeUserTokens(userId: string) {
  const db = await getDb();
  await db.update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function registerTenant(body: {
  businessName: string; name: string; email: string; password: string;
  stateCode: string; phone: string; gstin?: string; dlNumber?: string;
  tenantType?: 'stockist' | 'pharmacy';
}) {
  const db = await getDb();
  const normalizedEmail = body.email.trim().toLowerCase();
  const tenantType = body.tenantType ?? 'stockist';

  const existing = await db.query.users.findFirst({ where: eq(users.email, normalizedEmail) });
  if (existing) {
    const err = new Error('An account with this email already exists');
    (err as any).statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const inviteCode = tenantType === 'stockist' ? generateInviteCode() : undefined;

  const [tenant] = await db.insert(tenants).values({
    name: body.businessName, businessName: body.businessName,
    tenantType,
    stateCode: body.stateCode, phone: body.phone, email: normalizedEmail,
    gstin: body.gstin, dlNumber: body.dlNumber,
    inviteCode,
  }).returning();

  try {
    const [user] = await db.insert(users).values({
      tenantId: tenant.id, email: normalizedEmail, passwordHash,
      name: body.name, role: 'admin',
    }).returning();

    await seedLedgerAccounts(tenant.id);
    const accessToken = await issueAccessToken({ ...user, tenantType });
    return {
      accessToken,
      user: {
        id: user.id, tenantId: tenant.id, email: user.email,
        name: user.name, role: user.role, tenantType,
      },
    };
  } catch (e) {
    await db.delete(tenants).where(eq(tenants.id, tenant.id));
    throw e;
  }
}

export async function loginUser(email: string, password: string, expectedTenantType?: 'stockist' | 'pharmacy') {
  const db = await getDb();
  const normalizedEmail = email.trim().toLowerCase();

  const matches = await db
    .select({ user: users, tenant: tenants })
    .from(users)
    .innerJoin(tenants, eq(users.tenantId, tenants.id))
    .where(eq(users.email, normalizedEmail));

  const active = matches.filter((m) => m.user.isActive);
  if (active.length === 0) throw new Error('Invalid credentials');

  const passwordMatches = [];
  for (const row of active) {
    if (await bcrypt.compare(password, row.user.passwordHash)) passwordMatches.push(row);
  }
  if (passwordMatches.length === 0) throw new Error('Invalid credentials');

  let match = passwordMatches[0];
  if (expectedTenantType) {
    const forPanel = passwordMatches.find(
      (row) => (row.tenant.tenantType ?? 'stockist') === expectedTenantType,
    );
    if (!forPanel) {
      const actualType = passwordMatches[0].tenant.tenantType ?? 'stockist';
      throw new Error(`This account is registered on the ${actualType === 'pharmacy' ? 'Pharmacy' : 'Stockist'} panel`);
    }
    match = forPanel;
  }

  const { user, tenant } = match;
  const tenantType = tenant?.tenantType ?? 'stockist';

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const accessToken = await issueAccessToken({ ...user, tenantType });
  return {
    accessToken,
    user: {
      id: user.id, tenantId: user.tenantId, email: user.email,
      name: user.name, role: user.role, tenantType,
      onboardingCompleted: tenant?.onboardingCompleted ?? false,
      onboardingStep: tenant?.onboardingStep ?? 0,
    },
  };
}

export async function listUsers(tenantId: string) {
  const db = await getDb();
  return db.select({
    id: users.id, email: users.email, name: users.name, role: users.role,
    isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
  }).from(users).where(eq(users.tenantId, tenantId));
}

export async function createUser(tenantId: string, body: { email: string; name: string; role: 'admin' | 'biller' | 'pharmacist' | 'cashier'; password: string }) {
  const db = await getDb();
  // M50: normalise email so unique-index + future logins line up.
  const email = body.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(body.password, 10);
  const [user] = await db.insert(users).values({ tenantId, ...body, email, passwordHash }).returning({
    id: users.id, tenantId: users.tenantId, email: users.email, name: users.name,
    role: users.role, isActive: users.isActive, createdAt: users.createdAt,
  });
  return user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error('User not found');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new Error('Current password incorrect');
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
  await revokeUserTokens(userId);
}

export async function forgotPassword(email: string, tenantType?: 'stockist' | 'pharmacy') {
  const genericResponse = { success: true, message: 'If that email exists, a reset link has been sent.' };
  const db = await getDb();
  const normalizedEmail = email.trim().toLowerCase();

  let user: typeof users.$inferSelect | undefined;
  if (tenantType) {
    const rows = await db.select({ user: users }).from(users)
      .innerJoin(tenants, eq(users.tenantId, tenants.id))
      .where(and(eq(users.email, normalizedEmail), eq(tenants.tenantType, tenantType)));
    if (rows.length !== 1) return genericResponse;
    user = rows[0].user;
  } else {
    const rows = await db.select().from(users).where(eq(users.email, normalizedEmail));
    if (rows.length !== 1) return genericResponse;
    user = rows[0];
  }
  if (!user || !user.isActive) return genericResponse;

  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(passwordResetTokens).values({
    userId: user.id, jti, expiresAt,
  });

  const resetToken = await new SignJWT({ purpose: 'password_reset', email: user.email, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);

  if (env.NODE_ENV === 'development') {
    console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
  }

  const emailConfigured = env.emailConfigured;

  return { ...genericResponse, emailConfigured, devToken: env.NODE_ENV === 'development' ? resetToken : undefined };
}

export async function resetPassword(token: string, newPassword: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.purpose !== 'password_reset' || !payload.sub || !payload.jti) {
      throw new Error('Invalid reset token');
    }
    const db = await getDb();
    const [row] = await db.select().from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.jti, payload.jti as string), eq(passwordResetTokens.userId, payload.sub)))
      .limit(1);
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new Error('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, payload.sub));
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
    await revokeUserTokens(payload.sub);
    return { success: true, message: 'Password updated successfully' };
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid or expired reset token') throw err;
    throw new Error('Invalid or expired reset token');
  }
}
