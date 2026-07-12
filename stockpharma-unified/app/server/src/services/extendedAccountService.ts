import bcrypt from 'bcryptjs';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  consumerAccounts, consumerAddresses, doctorAccounts, mrAccounts,
  onlineOrders, onlineOrderItems, consultations, mrPharmacyVisits, tenants, products,
} from '../db/schema.js';
import { env } from '../env.js';
import { issueAccessToken } from './userService.js';

type AccountKind = 'consumer' | 'doctor' | 'mr';

async function registerAccount(
  kind: AccountKind,
  body: { email: string; password: string; name: string; phone?: string; specialization?: string; brand?: string },
) {
  const db = await getDb();
  const email = body.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(body.password, 10);

  if (kind === 'consumer') {
    const existing = await db.query.consumerAccounts.findFirst({ where: eq(consumerAccounts.email, email) });
    if (existing) { const e = new Error('Email already registered'); (e as any).statusCode = 409; throw e; }
    const [user] = await db.insert(consumerAccounts).values({
      email, passwordHash, name: body.name, phone: body.phone,
    }).returning();
    const token = await issueAccessToken({
      id: user.id, tenantId: user.id, email: user.email, name: user.name,
      role: 'consumer', tenantType: 'consumer' as any, accountKind: 'consumer',
    } as any);
    return { accessToken: token, user: { id: user.id, email: user.email, name: user.name, accountKind: 'consumer' } };
  }

  if (kind === 'doctor') {
    const existing = await db.query.doctorAccounts.findFirst({ where: eq(doctorAccounts.email, email) });
    if (existing) { const e = new Error('Email already registered'); (e as any).statusCode = 409; throw e; }
    const [user] = await db.insert(doctorAccounts).values({
      email, passwordHash, name: body.name, phone: body.phone,
      specialization: body.specialization,
      approvalStatus: env.NODE_ENV === 'development' ? 'approved' : 'pending',
    }).returning();
    const token = await issueAccessToken({
      id: user.id, tenantId: user.id, email: user.email, name: user.name,
      role: 'doctor', tenantType: 'doctor' as any, accountKind: 'doctor',
    } as any);
    return { accessToken: token, user: { id: user.id, email: user.email, name: user.name, accountKind: 'doctor', approvalStatus: user.approvalStatus } };
  }

  const existing = await db.query.mrAccounts.findFirst({ where: eq(mrAccounts.email, email) });
  if (existing) { const e = new Error('Email already registered'); (e as any).statusCode = 409; throw e; }
  const [user] = await db.insert(mrAccounts).values({
    email, passwordHash, name: body.name, phone: body.phone, brand: body.brand,
  }).returning();
  const token = await issueAccessToken({
    id: user.id, tenantId: user.id, email: user.email, name: user.name,
    role: 'mr', tenantType: 'mr' as any, accountKind: 'mr',
  } as any);
  return { accessToken: token, user: { id: user.id, email: user.email, name: user.name, accountKind: 'mr' } };
}

async function loginAccount(kind: AccountKind, email: string, password: string) {
  const db = await getDb();
  const normalized = email.trim().toLowerCase();

  if (kind === 'consumer') {
    const user = await db.query.consumerAccounts.findFirst({ where: eq(consumerAccounts.email, normalized) });
    if (!user || !user.isActive) throw new Error('Invalid credentials');
    if (!await bcrypt.compare(password, user.passwordHash)) throw new Error('Invalid credentials');
    const token = await issueAccessToken({
      id: user.id, tenantId: user.id, email: user.email, name: user.name,
      role: 'consumer', tenantType: 'consumer' as any, accountKind: 'consumer',
    } as any);
    return { accessToken: token, user: { id: user.id, email: user.email, name: user.name, accountKind: 'consumer' } };
  }

  if (kind === 'doctor') {
    const user = await db.query.doctorAccounts.findFirst({ where: eq(doctorAccounts.email, normalized) });
    if (!user || !user.isActive) throw new Error('Invalid credentials');
    if (!await bcrypt.compare(password, user.passwordHash)) throw new Error('Invalid credentials');
    const token = await issueAccessToken({
      id: user.id, tenantId: user.id, email: user.email, name: user.name,
      role: 'doctor', tenantType: 'doctor' as any, accountKind: 'doctor',
    } as any);
    return { accessToken: token, user: { id: user.id, email: user.email, name: user.name, accountKind: 'doctor', approvalStatus: user.approvalStatus } };
  }

  const user = await db.query.mrAccounts.findFirst({ where: eq(mrAccounts.email, normalized) });
  if (!user || !user.isActive) throw new Error('Invalid credentials');
  if (!await bcrypt.compare(password, user.passwordHash)) throw new Error('Invalid credentials');
  const token = await issueAccessToken({
    id: user.id, tenantId: user.id, email: user.email, name: user.name,
    role: 'mr', tenantType: 'mr' as any, accountKind: 'mr',
  } as any);
  return { accessToken: token, user: { id: user.id, email: user.email, name: user.name, accountKind: 'mr' } };
}

export const extendedAccountService = {
  registerConsumer: (b: Parameters<typeof registerAccount>[1]) => registerAccount('consumer', b),
  registerDoctor: (b: Parameters<typeof registerAccount>[1]) => registerAccount('doctor', b),
  registerMr: (b: Parameters<typeof registerAccount>[1]) => registerAccount('mr', b),
  loginConsumer: (e: string, p: string) => loginAccount('consumer', e, p),
  loginDoctor: (e: string, p: string) => loginAccount('doctor', e, p),
  loginMr: (e: string, p: string) => loginAccount('mr', e, p),

  async listPharmaciesForConsumer() {
    const db = await getDb();
    return db.select({
      id: tenants.id,
      name: tenants.businessName,
      slug: tenants.publicSlug,
      city: tenants.city,
      stateCode: tenants.stateCode,
    }).from(tenants).where(and(eq(tenants.tenantType, 'pharmacy'), eq(tenants.isPubliclyListed, true)));
  },

  async listPharmacyProducts(pharmacyTenantId: string) {
    const db = await getDb();
    return db.select({
      id: products.id,
      name: products.name,
      genericName: products.genericName,
      mrp: products.mrp,
      saleRate: products.saleRate,
      category: products.category,
    }).from(products).where(and(eq(products.tenantId, pharmacyTenantId), eq(products.isActive, true)));
  },

  async placeOnlineOrder(consumerId: string, body: {
    pharmacyTenantId: string;
    items: Array<{ productId: string; productName: string; qty: number; unitPrice: number; gstRate?: number }>;
    paymentMode: 'cod' | 'upi' | 'online';
    deliveryAddress: Record<string, string>;
    notes?: string;
    prescriptionUrl?: string;
  }) {
    const db = await getDb();
    const subtotal = body.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const taxTotal = body.items.reduce((s, i) => s + i.qty * i.unitPrice * ((i.gstRate ?? 12) / 100), 0);
    const total = subtotal + taxTotal;
    const orderNumber = `ONL-${Date.now().toString(36).toUpperCase()}`;

    const [order] = await db.insert(onlineOrders).values({
      pharmacyTenantId: body.pharmacyTenantId,
      consumerId,
      orderNumber,
      paymentMode: body.paymentMode,
      subtotal: String(subtotal),
      taxTotal: String(taxTotal),
      total: String(total),
      deliveryAddressJson: JSON.stringify(body.deliveryAddress),
      notes: body.notes,
      prescriptionUrl: body.prescriptionUrl,
      status: 'placed',
    }).returning();

    for (const item of body.items) {
      await db.insert(onlineOrderItems).values({
        orderId: order.id,
        productId: item.productId,
        productName: item.productName,
        qty: item.qty,
        unitPrice: String(item.unitPrice),
        gstRate: String(item.gstRate ?? 12),
        lineTotal: String(item.qty * item.unitPrice),
      });
    }
    return order;
  },

  async listConsumerOrders(consumerId: string) {
    const db = await getDb();
    return db.select().from(onlineOrders).where(eq(onlineOrders.consumerId, consumerId));
  },

  async listDoctorConsultations(doctorId: string) {
    const db = await getDb();
    return db.select().from(consultations).where(eq(consultations.doctorId, doctorId));
  },

  async bookConsultation(consumerId: string, body: {
    doctorId: string; mode: 'audio' | 'video' | 'clinic'; scheduledAt?: string; pharmacyTenantId?: string;
  }) {
    const db = await getDb();
    const doctor = await db.query.doctorAccounts.findFirst({ where: eq(doctorAccounts.id, body.doctorId) });
    if (!doctor) throw new Error('Doctor not found');
    const fee = body.mode === 'audio' ? doctor.consultationFeeAudio
      : body.mode === 'clinic' ? doctor.consultationFeeClinic
        : doctor.consultationFeeVideo;
    const [row] = await db.insert(consultations).values({
      doctorId: body.doctorId,
      consumerId,
      pharmacyTenantId: body.pharmacyTenantId,
      mode: body.mode,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
      fee: String(fee ?? 0),
      status: 'scheduled',
    }).returning();
    return row;
  },

  async listDoctors() {
    const db = await getDb();
    return db.select({
      id: doctorAccounts.id,
      name: doctorAccounts.name,
      specialization: doctorAccounts.specialization,
      consultationFeeVideo: doctorAccounts.consultationFeeVideo,
    }).from(doctorAccounts).where(and(eq(doctorAccounts.isActive, true), eq(doctorAccounts.approvalStatus, 'approved')));
  },

  async listMrVisits(mrId: string) {
    const db = await getDb();
    return db.select().from(mrPharmacyVisits).where(eq(mrPharmacyVisits.mrId, mrId));
  },

  async recordMrVisit(mrId: string, body: { pharmacyName: string; phone?: string; address?: string; notes?: string }) {
    const db = await getDb();
    const [row] = await db.insert(mrPharmacyVisits).values({ mrId, ...body }).returning();
    return row;
  },
};
