import { getDb } from '../db/client.js';
import { customers } from '../db/schema.js';
import { eq, and, desc, count, ilike, or } from 'drizzle-orm';

export async function listCustomers(tenantId: string, params: {
  search?: string; page?: number; pageSize?: number;
}) {
  const db = await getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, params.pageSize ?? 20);
  const offset = (page - 1) * pageSize;
  const searchPattern = params.search ? `%${params.search}%` : undefined;

  const where = and(
    eq(customers.tenantId, tenantId),
    searchPattern
      ? or(ilike(customers.name, searchPattern), ilike(customers.phone, searchPattern))
      : undefined,
  );

  const rows = await db.select().from(customers)
    .where(where)
    .orderBy(desc(customers.createdAt))
    .limit(pageSize)
    .offset(offset);

  const [{ total }] = await db.select({ total: count() }).from(customers).where(where);
  return { data: rows, total: Number(total), page, pageSize, pages: Math.ceil(Number(total) / pageSize) };
}

export async function getCustomer(tenantId: string, customerId: string) {
  const db = await getDb();
  return db.query.customers.findFirst({
    where: and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)),
  });
}

export async function createCustomer(tenantId: string, body: {
  name: string;
  phone?: string;
  email?: string;
  age?: number;
  gender?: string;
  allergies?: string;
  notes?: string;
}) {
  const db = await getDb();
  const [customer] = await db.insert(customers).values({ tenantId, ...body }).returning();
  return customer;
}

export async function updateCustomer(tenantId: string, customerId: string, body: {
  name?: string;
  phone?: string;
  email?: string;
  age?: number;
  gender?: string;
  allergies?: string;
  notes?: string;
}) {
  const db = await getDb();
  const [row] = await db.update(customers).set(body)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .returning();
  if (!row) throw new Error('Customer not found');
  return row;
}

export async function deleteCustomer(tenantId: string, customerId: string) {
  const db = await getDb();
  await db.delete(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));
  return { success: true };
}
