import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  users, tenants, consumerAccounts, doctorAccounts, mrAccounts,
} from '../db/schema.js';
import { env } from '../env.js';
import { registerTenant } from './userService.js';
import { ensurePlatformAdmin } from './platformService.js';

export const DEMO_USERS = {
  stockist: { email: 'stockist@demo.com', password: 'Demo1234', name: 'Demo Stockist Admin', businessName: 'Demo Stockist Co', loginPath: '/login' },
  pharmacy: { email: 'pharmacy@demo.com', password: 'Demo1234', name: 'Demo Pharmacy Admin', businessName: 'Demo Pharmacy', loginPath: '/login?panel=pharmacy' },
  platform: { email: 'admin@demo.com', password: 'Demo1234', name: 'Platform Admin', loginPath: '/platform/login' },
  consumer: { email: 'customer@demo.com', password: 'Demo1234', name: 'Demo Customer', loginPath: '/shop/login' },
  doctor: { email: 'doctor@demo.com', password: 'Demo1234', name: 'Dr Demo', loginPath: '/doctor/login' },
  mr: { email: 'mr@demo.com', password: 'Demo1234', name: 'Demo MR', loginPath: '/mr/login' },
} as const;

async function ensureTenantUser(
  tenantType: 'stockist' | 'pharmacy',
  spec: { email: string; password: string; name: string; businessName: string },
) {
  const db = await getDb();
  const email = spec.email.trim().toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return;

  await registerTenant({
    businessName: spec.businessName,
    name: spec.name,
    email,
    password: spec.password,
    stateCode: '08',
    phone: '9876543210',
    tenantType,
    dlNumber: tenantType === 'pharmacy' ? 'DL-DEMO-12345' : undefined,
  });

  if (tenantType === 'pharmacy') {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (user) {
      await db.update(tenants).set({
        isPubliclyListed: true,
        publicSlug: 'demo-pharmacy',
        city: 'Jaipur',
        approvalStatus: 'approved',
      }).where(eq(tenants.id, user.tenantId));
    }
  }
}

async function ensureExtendedAccount(
  table: 'consumer' | 'doctor' | 'mr',
  spec: { email: string; password: string; name: string },
) {
  const db = await getDb();
  const email = spec.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(spec.password, 10);

  if (table === 'consumer') {
    const existing = await db.query.consumerAccounts.findFirst({ where: eq(consumerAccounts.email, email) });
    if (existing) return;
    await db.insert(consumerAccounts).values({ email, passwordHash, name: spec.name, phone: '9876543210' });
    return;
  }
  if (table === 'doctor') {
    const existing = await db.query.doctorAccounts.findFirst({ where: eq(doctorAccounts.email, email) });
    if (existing) return;
    await db.insert(doctorAccounts).values({
      email, passwordHash, name: spec.name, phone: '9876543210',
      specialization: 'General Physician', registrationNo: 'MCI-DEMO-001',
      approvalStatus: 'approved',
    });
    return;
  }
  const existing = await db.query.mrAccounts.findFirst({ where: eq(mrAccounts.email, email) });
  if (existing) return;
  await db.insert(mrAccounts).values({
    email, passwordHash, name: spec.name, phone: '9876543210', brand: 'Demo Pharma', territory: 'North',
  });
}

/** Idempotent dev seed — all 6 panels login-ready on one localhost. */
export async function seedDemoUsers() {
  if (env.NODE_ENV !== 'development' || !env.SEED_DEMO_USERS) return;

  await ensurePlatformAdmin(DEMO_USERS.platform.email, DEMO_USERS.platform.password, DEMO_USERS.platform.name);
  await ensureTenantUser('stockist', DEMO_USERS.stockist);
  await ensureTenantUser('pharmacy', DEMO_USERS.pharmacy);
  await ensureExtendedAccount('consumer', DEMO_USERS.consumer);
  await ensureExtendedAccount('doctor', DEMO_USERS.doctor);
  await ensureExtendedAccount('mr', DEMO_USERS.mr);

  console.log('Demo users ready (see http://localhost:3000):');
  for (const [role, u] of Object.entries(DEMO_USERS)) {
    console.log(`  ${role}: ${u.email} / ${u.password} → ${u.loginPath}`);
  }
}
