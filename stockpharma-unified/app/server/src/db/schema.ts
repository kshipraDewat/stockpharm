import {
  pgTable, uuid, text, numeric, integer, boolean, timestamp, index,
  primaryKey, uniqueIndex,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

// ─── Auth / Tenancy ───────────────────────────────────────────────────────────

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  businessName: text('business_name').notNull(),
  tenantType: text('tenant_type').$type<'stockist' | 'pharmacy'>().notNull().default('stockist'),
  stateCode: text('state_code').notNull().default('08'),
  gstin: text('gstin'),
  dlNumber: text('dl_number'),
  addressJson: text('address_json'),
  notificationsJson: text('notifications_json'),
  inviteCode: text('invite_code'),
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  onboardingStep: integer('onboarding_step').notNull().default(0),
  approvalStatus: text('approval_status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('approved'),
  businessType: text('business_type'),
  panNumber: text('pan_number'),
  whatsapp: text('whatsapp'),
  city: text('city'),
  pinCode: text('pin_code'),
  bankAccountJson: text('bank_account_json'),
  documentsJson: text('documents_json'),
  isPubliclyListed: boolean('is_publicly_listed').notNull().default(true),
  acceptingNewConnections: boolean('accepting_new_connections').notNull().default(true),
  publicSlug: text('public_slug'),
  aboutText: text('about_text'),
  coverageStateCodes: text('coverage_state_codes'),
  categories: text('categories'),
  logoUrl: text('logo_url'),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  ...timestamps,
}, (t) => [
  uniqueIndex('tenants_invite_code_unique').on(t.inviteCode),
  uniqueIndex('tenants_public_slug_unique').on(t.publicSlug),
]);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').$type<'admin' | 'biller' | 'pharmacist' | 'cashier'>().notNull().default('biller'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex('users_tenant_email_unique').on(t.tenantId, t.email),
  index('users_tenant_id_idx').on(t.tenantId),
]);

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  ...timestamps,
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jti: text('jti').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  ...timestamps,
}, (t) => [index('password_reset_tokens_user_id_idx').on(t.userId)]);

// ─── Masters ─────────────────────────────────────────────────────────────────

export const suppliers = pgTable('suppliers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contactPerson: text('contact_person').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  address: text('address').notNull(),
  stateCode: text('state_code').notNull(),
  gstin: text('gstin'),
  dlNumber: text('dl_number'),
  paymentTermsDays: integer('payment_terms_days').notNull().default(30),
  status: text('status').$type<'active' | 'inactive' | 'blocked'>().notNull().default('active'),
  ...timestamps,
}, (t) => [index('suppliers_tenant_id_idx').on(t.tenantId), uniqueIndex('suppliers_tenant_id_unique').on(t.tenantId, t.id)]);

export const pharmacies = pgTable('pharmacies', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  contactPerson: text('contact_person').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  address: text('address').notNull(),
  stateCode: text('state_code').notNull(),
  gstin: text('gstin'),
  dlNumber: text('dl_number'),
  creditLimit: numeric('credit_limit', { precision: 14, scale: 2 }).notNull().default('0'),
  paymentTermsDays: integer('payment_terms_days').notNull().default(30),
  status: text('status').$type<'active' | 'inactive' | 'blocked'>().notNull().default('active'),
  outstanding: numeric('outstanding', { precision: 14, scale: 2 }).notNull().default('0'),
  openingBalance: numeric('opening_balance', { precision: 14, scale: 2 }).notNull().default('0'),
  portalConnected: boolean('portal_connected').notNull().default(false),
  pharmacyTenantId: uuid('pharmacy_tenant_id'),
  ...timestamps,
}, (t) => [index('pharmacies_tenant_id_idx').on(t.tenantId), uniqueIndex('pharmacies_tenant_id_unique').on(t.tenantId, t.id)]);

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  genericName: text('generic_name'),
  manufacturer: text('manufacturer'),
  category: text('category').notNull(),
  hsnCode: text('hsn_code'),
  scheduleType: text('schedule_type').$type<'NONE' | 'H' | 'H1' | 'X' | 'NDPS'>().notNull().default('NONE'),
  packSize: text('pack_size').notNull().default('1'),
  baseUnit: text('base_unit').notNull().default('Tab'),
  saleUnit: text('sale_unit').notNull().default('Strip'),
  convFactor: integer('conv_factor').notNull().default(10),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull().default('12'),
  mrp: numeric('mrp', { precision: 14, scale: 2 }).notNull(),
  purchaseRate: numeric('purchase_rate', { precision: 14, scale: 2 }).notNull(),
  saleRate: numeric('sale_rate', { precision: 14, scale: 2 }).notNull(),
  minStockLevel: integer('min_stock_level').notNull().default(10),
  schemeBase: integer('scheme_base'),
  schemeBonus: integer('scheme_bonus'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
}, (t) => [index('products_tenant_id_idx').on(t.tenantId), uniqueIndex('products_tenant_id_unique').on(t.tenantId, t.id)]);

export const productBatches = pgTable('product_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => products.id),
  supplierId: uuid('supplier_id').references(() => suppliers.id),
  sourcePurchaseId: uuid('source_purchase_id'),
  batchNumber: text('batch_number').notNull(),
  expiryDate: text('expiry_date').notNull(),
  mrp: numeric('mrp', { precision: 14, scale: 2 }).notNull(),
  purchaseRate: numeric('purchase_rate', { precision: 14, scale: 2 }).notNull(),
  saleRate: numeric('sale_rate', { precision: 14, scale: 2 }).notNull(),
  qtyReceived: integer('qty_received').notNull(),
  qtyOnHand: integer('qty_on_hand').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('batches_product_id_idx').on(t.productId),
  index('batches_tenant_id_idx').on(t.tenantId),
  uniqueIndex('product_batches_tenant_id_unique').on(t.tenantId, t.id),
  uniqueIndex('product_batches_product_batch_expiry_unique').on(t.tenantId, t.productId, t.batchNumber, t.expiryDate),
]);

// ─── Transactions ─────────────────────────────────────────────────────────────

export const purchases = pgTable('purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  grnNumber: text('grn_number'),
  supplierInvoiceNo: text('supplier_invoice_no'),
  invoiceDate: text('invoice_date'),
  receivedDate: text('received_date'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  status: text('status').$type<'pending' | 'received'>().notNull().default('pending'),
  invoiceFileUrl: text('invoice_file_url'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  ...timestamps,
}, (t) => [index('purchases_tenant_id_idx').on(t.tenantId), uniqueIndex('purchases_tenant_id_unique').on(t.tenantId, t.id)]);

export const purchaseItems = pgTable('purchase_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseId: uuid('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id),
  batchNumber: text('batch_number').notNull(),
  expiryDate: text('expiry_date').notNull(),
  qty: integer('qty').notNull(),
  freeQty: integer('free_qty').notNull().default(0),
  mrp: numeric('mrp', { precision: 14, scale: 2 }).notNull(),
  purchaseRate: numeric('purchase_rate', { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(),
  lineSubtotal: numeric('line_subtotal', { precision: 14, scale: 2 }).notNull(),
  lineTax: numeric('line_tax', { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  pharmacyId: uuid('pharmacy_id').notNull().references(() => pharmacies.id),
  orderNumber: text('order_number').notNull(),
  orderDate: text('order_date').notNull(),
  status: text('status').$type<'pending' | 'packed' | 'shipped' | 'delivered' | 'cancelled'>().notNull().default('pending'),
  paymentMode: text('payment_mode').$type<'credit' | 'cash'>().notNull().default('credit'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  isInterstate: boolean('is_interstate').notNull().default(false),
  placeOfSupply: text('place_of_supply').notNull().default('08'),
  notes: text('notes'),
  source: text('source').$type<'stockist_created' | 'pharmacy_submitted'>().notNull().default('stockist_created'),
  externalPharmacyOrderId: text('external_pharmacy_order_id'),
  stockistConnectionId: uuid('stockist_connection_id'),
  rejectionReason: text('rejection_reason'),
  trackingCarrier: text('tracking_carrier'),
  trackingAwb: text('tracking_awb'),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedBy: uuid('approved_by').references(() => users.id),
  createdBy: uuid('created_by').references(() => users.id),
  ...timestamps,
}, (t) => [
  index('orders_tenant_id_idx').on(t.tenantId),
  index('orders_pharmacy_id_idx').on(t.pharmacyId),
  index('orders_source_idx').on(t.tenantId, t.source),
  uniqueIndex('orders_number_tenant_unique').on(t.tenantId, t.orderNumber),
  uniqueIndex('orders_tenant_id_unique').on(t.tenantId, t.id),
]);

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id),
  batchId: uuid('batch_id').references(() => productBatches.id),
  qty: integer('qty').notNull(),
  freeQty: integer('free_qty').notNull().default(0),
  rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(),
  lineSubtotal: numeric('line_subtotal', { precision: 14, scale: 2 }).notNull(),
  lineTax: numeric('line_tax', { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
}, (t) => [index('order_items_order_id_idx').on(t.orderId)]);

export const bills = pgTable('bills', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').notNull().references(() => orders.id),
  pharmacyId: uuid('pharmacy_id').notNull().references(() => pharmacies.id),
  billNumber: text('bill_number').notNull(),
  billDate: text('bill_date').notNull(),
  dueDate: text('due_date').notNull(),
  isInterstate: boolean('is_interstate').notNull().default(false),
  placeOfSupply: text('place_of_supply').notNull().default('08'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
  cgst: numeric('cgst', { precision: 14, scale: 2 }).notNull().default('0'),
  sgst: numeric('sgst', { precision: 14, scale: 2 }).notNull().default('0'),
  igst: numeric('igst', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull(),
  paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  status: text('status').$type<'unpaid' | 'partial' | 'paid' | 'overdue'>().notNull().default('unpaid'),
  createdBy: uuid('created_by').references(() => users.id),
  ...timestamps,
}, (t) => [
  index('bills_tenant_id_idx').on(t.tenantId),
  index('bills_pharmacy_id_idx').on(t.pharmacyId),
  uniqueIndex('bills_number_tenant_unique').on(t.tenantId, t.billNumber),
  uniqueIndex('bills_tenant_id_unique').on(t.tenantId, t.id),
  // C6: one bill per order at the DB level — eliminates the race in generateBill.
  uniqueIndex('bills_order_id_unique').on(t.orderId),
  // me81: speed up status/dueDate filters used by overdue checks and reports.
  index('bills_due_date_idx').on(t.dueDate),
  index('bills_status_idx').on(t.status),
]);

// C24: stock_movements is the canonical inventory-mutation log. Every change to
// product_batches.qty_on_hand should emit exactly one row here for provenance,
// reconciliation, and post-incident forensics.
export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').references(() => productBatches.id, { onDelete: 'set null' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  delta: integer('delta').notNull(),
  reason: text('reason').$type<
    'purchase_receive' | 'grn_receive' | 'sale' | 'sale_void' | 'return_restock'
    | 'adjustment' | 'transfer_in' | 'transfer_out' | 'write_off' | 'other'
  >().notNull(),
  refType: text('ref_type').$type<
    'purchase' | 'grn' | 'order' | 'sale' | 'return' | 'adjustment' | 'manual'
  >().notNull(),
  refId: uuid('ref_id'),
  refNumber: text('ref_number'),
  notes: text('notes'),
  performedBy: uuid('performed_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('stock_movements_tenant_idx').on(t.tenantId),
  index('stock_movements_batch_idx').on(t.batchId),
  index('stock_movements_product_idx').on(t.productId),
  index('stock_movements_ref_idx').on(t.refType, t.refId),
]);

export const billItems = pgTable('bill_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  billId: uuid('bill_id').notNull().references(() => bills.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id),
  batchId: uuid('batch_id').references(() => productBatches.id),
  qty: integer('qty').notNull(),
  freeQty: integer('free_qty').notNull().default(0),
  rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(),
  lineSubtotal: numeric('line_subtotal', { precision: 14, scale: 2 }).notNull(),
  cgst: numeric('cgst', { precision: 14, scale: 2 }).notNull().default('0'),
  sgst: numeric('sgst', { precision: 14, scale: 2 }).notNull().default('0'),
  igst: numeric('igst', { precision: 14, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  pharmacyId: uuid('pharmacy_id').notNull().references(() => pharmacies.id),
  paymentNumber: text('payment_number').notNull(),
  paymentDate: text('payment_date').notNull(),
  method: text('method').$type<'cash' | 'upi' | 'bank' | 'cheque'>().notNull(),
  referenceNo: text('reference_no'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  unallocatedAmount: numeric('unallocated_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  status: text('status').$type<'successful' | 'pending' | 'failed' | 'voided'>().notNull().default('successful'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  ...timestamps,
}, (t) => [index('payments_tenant_id_idx').on(t.tenantId)]);

export const paymentAllocations = pgTable('payment_allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  billId: uuid('bill_id').notNull().references(() => bills.id),
  allocatedAmount: numeric('allocated_amount', { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const supplierPayments = pgTable('supplier_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  supplierId: uuid('supplier_id').notNull().references(() => suppliers.id),
  paymentNumber: text('payment_number').notNull(),
  paymentDate: text('payment_date').notNull(),
  method: text('method').$type<'cash' | 'upi' | 'bank' | 'cheque'>().notNull(),
  referenceNo: text('reference_no'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  ...timestamps,
}, (t) => [
  index('supplier_payments_tenant_id_idx').on(t.tenantId),
  index('supplier_payments_supplier_id_idx').on(t.supplierId),
]);

export const returns = pgTable('returns', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').references(() => orders.id),
  pharmacyId: uuid('pharmacy_id').notNull().references(() => pharmacies.id),
  returnNumber: text('return_number').notNull(),
  returnDate: text('return_date').notNull(),
  reason: text('reason').$type<'expired' | 'damaged' | 'wrong_item' | 'cancelled' | 'other'>().notNull().default('other'),
  notes: text('notes'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  status: text('status').$type<'requested' | 'processed' | 'rejected' | 'cancelled'>().notNull().default('requested'),
  createdBy: uuid('created_by').references(() => users.id),
  ...timestamps,
}, (t) => [index('returns_tenant_id_idx').on(t.tenantId), uniqueIndex('returns_tenant_id_unique').on(t.tenantId, t.id)]);

export const returnItems = pgTable('return_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  returnId: uuid('return_id').notNull().references(() => returns.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  orderItemId: uuid('order_item_id').references(() => orderItems.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  batchId: uuid('batch_id').references(() => productBatches.id),
  qty: integer('qty').notNull(),
  rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});

// ─── Ledger ───────────────────────────────────────────────────────────────────

export const ledgerAccounts = pgTable('ledger_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  type: text('type').$type<'asset' | 'liability' | 'income' | 'expense' | 'equity'>().notNull(),
  parentId: uuid('parent_id'),
  ...timestamps,
}, (t) => [
  uniqueIndex('ledger_accounts_code_tenant_unique').on(t.tenantId, t.code),
]);

export const ledgerEntries = pgTable('ledger_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  txnDate: text('txn_date').notNull(),
  refType: text('ref_type').$type<'order' | 'bill' | 'payment' | 'return' | 'purchase' | 'adjustment'>().notNull(),
  refId: uuid('ref_id').notNull(),
  narration: text('narration').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('ledger_entries_tenant_id_idx').on(t.tenantId)]);

export const ledgerLines = pgTable('ledger_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  entryId: uuid('entry_id').notNull().references(() => ledgerEntries.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  accountId: uuid('account_id').notNull().references(() => ledgerAccounts.id),
  partnerType: text('partner_type').$type<'pharmacy' | 'supplier' | null>(),
  partnerId: uuid('partner_id'),
  debit: numeric('debit', { precision: 14, scale: 2 }).notNull().default('0'),
  credit: numeric('credit', { precision: 14, scale: 2 }).notNull().default('0'),
}, (t) => [index('ledger_lines_entry_id_idx').on(t.entryId)]);

// ─── Pharmacy tenant entities ─────────────────────────────────────────────────

export const pharmacyPurchaseOrders = pgTable('pharmacy_purchase_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  stockistConnectionId: uuid('stockist_connection_id').notNull().references(() => stockistConnections.id),
  poNumber: text('po_number').notNull(),
  orderDate: text('order_date').notNull(),
  status: text('status').$type<
    'draft' | 'submitted' | 'accepted' | 'rejected' | 'packed' | 'shipped' | 'delivered' | 'partially_received' | 'received' | 'cancel_requested' | 'cancelled'
  >().notNull().default('draft'),
  paymentMode: text('payment_mode').$type<'credit' | 'cash'>().notNull().default('credit'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  externalOrderId: uuid('external_order_id'),
  rejectionReason: text('rejection_reason'),
  trackingCarrier: text('tracking_carrier'),
  trackingAwb: text('tracking_awb'),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  ...timestamps,
}, (t) => [
  index('pharmacy_po_tenant_idx').on(t.tenantId),
  uniqueIndex('pharmacy_po_number_tenant_unique').on(t.tenantId, t.poNumber),
]);

export const pharmacyPurchaseOrderItems = pgTable('pharmacy_purchase_order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => pharmacyPurchaseOrders.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  catalogItemId: uuid('catalog_item_id'),
  stockistProductId: uuid('stockist_product_id').notNull(),
  productName: text('product_name').notNull(),
  qty: integer('qty').notNull(),
  freeQty: integer('free_qty').notNull().default(0),
  receivedQty: integer('received_qty').notNull().default(0),
  rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(),
  lineSubtotal: numeric('line_subtotal', { precision: 14, scale: 2 }).notNull(),
  lineTax: numeric('line_tax', { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});

export const pharmacyGrns = pgTable('pharmacy_grns', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  purchaseOrderId: uuid('purchase_order_id').notNull().references(() => pharmacyPurchaseOrders.id),
  stockistConnectionId: uuid('stockist_connection_id').notNull().references(() => stockistConnections.id),
  grnNumber: text('grn_number').notNull(),
  receivedDate: text('received_date').notNull(),
  status: text('status').$type<'received' | 'partial'>().notNull().default('received'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  ...timestamps,
}, (t) => [
  index('pharmacy_grn_tenant_idx').on(t.tenantId),
  uniqueIndex('pharmacy_grn_number_tenant_unique').on(t.tenantId, t.grnNumber),
]);

export const pharmacyGrnItems = pgTable('pharmacy_grn_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  grnId: uuid('grn_id').notNull().references(() => pharmacyGrns.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  purchaseOrderItemId: uuid('purchase_order_item_id').references(() => pharmacyPurchaseOrderItems.id),
  productId: uuid('product_id').notNull().references(() => products.id),
  batchId: uuid('batch_id').references(() => productBatches.id),
  batchNumber: text('batch_number').notNull(),
  expiryDate: text('expiry_date').notNull(),
  qty: integer('qty').notNull(),
  freeQty: integer('free_qty').notNull().default(0),
  mrp: numeric('mrp', { precision: 14, scale: 2 }).notNull(),
  purchaseRate: numeric('purchase_rate', { precision: 14, scale: 2 }).notNull(),
  saleRate: numeric('sale_rate', { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  age: integer('age'),
  gender: text('gender'),
  allergies: text('allergies'),
  notes: text('notes'),
  ...timestamps,
}, (t) => [index('customers_tenant_id_idx').on(t.tenantId)]);

export const retailSales = pgTable('retail_sales', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  saleNumber: text('sale_number').notNull(),
  saleDate: text('sale_date').notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  paymentMethod: text('payment_method').$type<'cash' | 'upi' | 'card'>().notNull().default('cash'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  taxAmount: numeric('tax_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  discountAmount: numeric('discount_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  amountReceived: numeric('amount_received', { precision: 14, scale: 2 }).notNull().default('0'),
  changeAmount: numeric('change_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  status: text('status').$type<'completed' | 'voided'>().notNull().default('completed'),
  cashierId: uuid('cashier_id').references(() => users.id),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedBy: uuid('voided_by').references(() => users.id),
  voidReason: text('void_reason'),
  notes: text('notes'),
  paymentBreakdownJson: text('payment_breakdown_json'),
  // C26: prescription fields required when any line item is Schedule H/H1/X/NDPS.
  rxNumber: text('rx_number'),
  doctorName: text('doctor_name'),
  doctorRegNo: text('doctor_reg_no'),
  patientName: text('patient_name'),
  patientAge: integer('patient_age'),
  ...timestamps,
}, (t) => [
  index('retail_sales_tenant_idx').on(t.tenantId),
  uniqueIndex('retail_sales_number_tenant_unique').on(t.tenantId, t.saleNumber),
]);

export const retailSaleItems = pgTable('retail_sale_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  saleId: uuid('sale_id').notNull().references(() => retailSales.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id),
  batchId: uuid('batch_id').notNull().references(() => productBatches.id),
  batchNumber: text('batch_number').notNull(),
  expiryDate: text('expiry_date').notNull(),
  qty: integer('qty').notNull(),
  rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull().default('0'),
  lineSubtotal: numeric('line_subtotal', { precision: 14, scale: 2 }).notNull(),
  lineTax: numeric('line_tax', { precision: 14, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});

export const payableBills = pgTable('payable_bills', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  stockistConnectionId: uuid('stockist_connection_id').notNull().references(() => stockistConnections.id),
  purchaseOrderId: uuid('purchase_order_id').references(() => pharmacyPurchaseOrders.id),
  externalBillId: uuid('external_bill_id'),
  externalOrderId: uuid('external_order_id'),
  billNumber: text('bill_number').notNull(),
  stockistName: text('stockist_name').notNull(),
  billDate: text('bill_date').notNull(),
  dueDate: text('due_date').notNull(),
  isInterstate: boolean('is_interstate').notNull().default(false),
  placeOfSupply: text('place_of_supply').notNull().default('08'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
  cgst: numeric('cgst', { precision: 14, scale: 2 }).notNull().default('0'),
  sgst: numeric('sgst', { precision: 14, scale: 2 }).notNull().default('0'),
  igst: numeric('igst', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull(),
  paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  status: text('status').$type<'unpaid' | 'partial' | 'paid' | 'overdue'>().notNull().default('unpaid'),
  ...timestamps,
}, (t) => [
  index('payable_bills_tenant_idx').on(t.tenantId),
  uniqueIndex('payable_bills_number_tenant_unique').on(t.tenantId, t.billNumber),
]);

export const payableBillItems = pgTable('payable_bill_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  billId: uuid('bill_id').notNull().references(() => payableBills.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  productId: uuid('product_id').references(() => products.id),
  externalProductId: uuid('external_product_id'),
  productName: text('product_name').notNull(),
  batchNumber: text('batch_number'),
  expiryDate: text('expiry_date'),
  qty: integer('qty').notNull(),
  freeQty: integer('free_qty').notNull().default(0),
  rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(),
  lineSubtotal: numeric('line_subtotal', { precision: 14, scale: 2 }).notNull(),
  cgst: numeric('cgst', { precision: 14, scale: 2 }).notNull().default('0'),
  sgst: numeric('sgst', { precision: 14, scale: 2 }).notNull().default('0'),
  igst: numeric('igst', { precision: 14, scale: 2 }).notNull().default('0'),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});

export const payablePayments = pgTable('payable_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  stockistConnectionId: uuid('stockist_connection_id').notNull().references(() => stockistConnections.id),
  paymentNumber: text('payment_number').notNull(),
  paymentDate: text('payment_date').notNull(),
  method: text('method').$type<'cash' | 'upi' | 'bank' | 'cheque'>().notNull(),
  referenceNo: text('reference_no'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  unallocatedAmount: numeric('unallocated_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  status: text('status').$type<'successful' | 'voided'>().notNull().default('successful'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  ...timestamps,
}, (t) => [index('payable_payments_tenant_idx').on(t.tenantId)]);

export const payablePaymentAllocations = pgTable('payable_payment_allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  paymentId: uuid('payment_id').notNull().references(() => payablePayments.id, { onDelete: 'cascade' }),
  billId: uuid('bill_id').notNull().references(() => payableBills.id),
  allocatedAmount: numeric('allocated_amount', { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const stockistReturns = pgTable('stockist_returns', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  stockistConnectionId: uuid('stockist_connection_id').notNull().references(() => stockistConnections.id),
  purchaseOrderId: uuid('purchase_order_id').references(() => pharmacyPurchaseOrders.id),
  payableBillId: uuid('payable_bill_id').references(() => payableBills.id),
  externalReturnId: uuid('external_return_id'),
  returnNumber: text('return_number').notNull(),
  returnDate: text('return_date').notNull(),
  reason: text('reason').$type<'expired' | 'damaged' | 'wrong_item' | 'cancelled' | 'other'>().notNull().default('other'),
  notes: text('notes'),
  totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull().default('0'),
  status: text('status').$type<'requested' | 'approved' | 'processed' | 'rejected' | 'cancelled'>().notNull().default('requested'),
  rejectionReason: text('rejection_reason'),
  createdBy: uuid('created_by').references(() => users.id),
  ...timestamps,
}, (t) => [index('stockist_returns_tenant_idx').on(t.tenantId)]);

export const stockistReturnItems = pgTable('stockist_return_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  returnId: uuid('return_id').notNull().references(() => stockistReturns.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull(),
  productId: uuid('product_id').notNull().references(() => products.id),
  batchId: uuid('batch_id').references(() => productBatches.id),
  qty: integer('qty').notNull(),
  rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});

// ─── Cross-tenant (Stockist ↔ Pharmacy) ──────────────────────────────────────

export const stockistConnections = pgTable('stockist_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  stockistTenantId: uuid('stockist_tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  pharmacyTenantId: uuid('pharmacy_tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  linkedPharmacyId: uuid('linked_pharmacy_id').references(() => pharmacies.id),
  status: text('status').$type<'pending' | 'active' | 'rejected' | 'withdrawn' | 'disconnected'>().notNull().default('pending'),
  requestSource: text('request_source').$type<'discovery' | 'invite_code' | 'gstin_search'>(),
  requestNote: text('request_note'),
  expectedMonthlyVolume: integer('expected_monthly_volume'),
  creditLimit: numeric('credit_limit', { precision: 14, scale: 2 }),
  paymentTermsDays: integer('payment_terms_days'),
  rejectionReason: text('rejection_reason'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex('connections_stockist_pharmacy_unique').on(t.stockistTenantId, t.pharmacyTenantId),
  index('connections_stockist_idx').on(t.stockistTenantId),
  index('connections_pharmacy_idx').on(t.pharmacyTenantId),
]);

export const stockistPublicCatalogItems = pgTable('stockist_public_catalog_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  stockistTenantId: uuid('stockist_tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  name: text('name').notNull(),
  genericName: text('generic_name'),
  manufacturer: text('manufacturer'),
  category: text('category').notNull(),
  hsnCode: text('hsn_code'),
  scheduleType: text('schedule_type').notNull().default('NONE'),
  packSize: text('pack_size').notNull().default('1'),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(),
  mrp: numeric('mrp', { precision: 14, scale: 2 }).notNull(),
  saleRate: numeric('sale_rate', { precision: 14, scale: 2 }),
  availabilityHint: text('availability_hint').$type<'in_stock' | 'low' | 'out_of_stock'>().notNull().default('in_stock'),
  isPublic: boolean('is_public').notNull().default(true),
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, (t) => [
  index('public_catalog_stockist_idx').on(t.stockistTenantId),
  uniqueIndex('public_catalog_stockist_product_unique').on(t.stockistTenantId, t.productId),
]);

export const stockistCatalogItems = pgTable('stockist_catalog_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id').notNull().references(() => stockistConnections.id, { onDelete: 'cascade' }),
  stockistProductId: uuid('stockist_product_id').notNull(),
  pharmacyTenantId: uuid('pharmacy_tenant_id').notNull(),
  name: text('name').notNull(),
  genericName: text('generic_name'),
  manufacturer: text('manufacturer'),
  category: text('category').notNull(),
  hsnCode: text('hsn_code'),
  scheduleType: text('schedule_type').notNull().default('NONE'),
  packSize: text('pack_size').notNull().default('1'),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull(),
  mrp: numeric('mrp', { precision: 14, scale: 2 }).notNull(),
  saleRate: numeric('sale_rate', { precision: 14, scale: 2 }).notNull(),
  schemeBase: integer('scheme_base'),
  schemeBonus: integer('scheme_bonus'),
  availabilityHint: text('availability_hint').$type<'in_stock' | 'low' | 'out_of_stock'>().notNull().default('in_stock'),
  localProductId: uuid('local_product_id'),
  syncedAt: timestamp('synced_at', { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, (t) => [
  index('catalog_connection_idx').on(t.connectionId),
  uniqueIndex('catalog_connection_product_unique').on(t.connectionId, t.stockistProductId),
]);

export const processedCrossTenantEvents = pgTable('processed_cross_tenant_events', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id').notNull(),
}, (t) => [
  uniqueIndex('processed_cross_tenant_events_unique').on(t.tenantId, t.eventId),
]);

export const crossTenantEvents = pgTable('cross_tenant_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceTenantId: uuid('source_tenant_id').notNull(),
  targetTenantId: uuid('target_tenant_id').notNull(),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json').notNull(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('cross_events_target_idx').on(t.targetTenantId, t.deliveredAt),
]);

// ─── Audit ────────────────────────────────────────────────────────────────────

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('audit_logs_tenant_id_idx').on(t.tenantId),
  index('audit_logs_entity_type_idx').on(t.entityType),
]);

// ─── Unified platform extensions (consolidates sibling-repo features) ───────

export const platformUsers = pgTable('platform_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').$type<'super_admin'>().notNull().default('super_admin'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const consumerAccounts = pgTable('consumer_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const consumerAddresses = pgTable('consumer_addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  consumerId: uuid('consumer_id').notNull().references(() => consumerAccounts.id, { onDelete: 'cascade' }),
  label: text('label').notNull().default('Home'),
  addressLine: text('address_line').notNull(),
  city: text('city').notNull(),
  pinCode: text('pin_code').notNull(),
  stateCode: text('state_code').notNull().default('08'),
  isDefault: boolean('is_default').notNull().default(false),
  ...timestamps,
}, (t) => [index('consumer_addresses_consumer_idx').on(t.consumerId)]);

export const onlineOrders = pgTable('online_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  pharmacyTenantId: uuid('pharmacy_tenant_id').notNull().references(() => tenants.id),
  consumerId: uuid('consumer_id').notNull().references(() => consumerAccounts.id),
  orderNumber: text('order_number').notNull(),
  status: text('status').$type<'placed' | 'confirmed' | 'preparing' | 'out_for_delivery' | 'delivered' | 'cancelled'>().notNull().default('placed'),
  paymentMode: text('payment_mode').$type<'cod' | 'upi' | 'online'>().notNull().default('cod'),
  subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
  taxTotal: numeric('tax_total', { precision: 14, scale: 2 }).notNull().default('0'),
  total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
  deliveryAddressJson: text('delivery_address_json'),
  prescriptionUrl: text('prescription_url'),
  notes: text('notes'),
  ...timestamps,
}, (t) => [
  uniqueIndex('online_orders_number_unique').on(t.pharmacyTenantId, t.orderNumber),
  index('online_orders_pharmacy_idx').on(t.pharmacyTenantId),
]);

export const onlineOrderItems = pgTable('online_order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').notNull().references(() => onlineOrders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  productName: text('product_name').notNull(),
  qty: integer('qty').notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
  gstRate: numeric('gst_rate', { precision: 5, scale: 2 }).notNull().default('12'),
  lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
});

export const doctorAccounts = pgTable('doctor_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  specialization: text('specialization'),
  registrationNo: text('registration_no'),
  phone: text('phone'),
  consultationFeeAudio: numeric('consultation_fee_audio', { precision: 10, scale: 2 }).default('300'),
  consultationFeeVideo: numeric('consultation_fee_video', { precision: 10, scale: 2 }).default('500'),
  consultationFeeClinic: numeric('consultation_fee_clinic', { precision: 10, scale: 2 }).default('200'),
  approvalStatus: text('approval_status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const consultations = pgTable('consultations', {
  id: uuid('id').defaultRandom().primaryKey(),
  doctorId: uuid('doctor_id').notNull().references(() => doctorAccounts.id),
  consumerId: uuid('consumer_id').notNull().references(() => consumerAccounts.id),
  pharmacyTenantId: uuid('pharmacy_tenant_id').references(() => tenants.id),
  mode: text('mode').$type<'audio' | 'video' | 'clinic'>().notNull().default('video'),
  status: text('status').$type<'scheduled' | 'in_progress' | 'completed' | 'cancelled'>().notNull().default('scheduled'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  fee: numeric('fee', { precision: 10, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  prescriptionJson: text('prescription_json'),
  ...timestamps,
}, (t) => [index('consultations_doctor_idx').on(t.doctorId)]);

export const mrAccounts = pgTable('mr_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  brand: text('brand'),
  phone: text('phone'),
  territory: text('territory'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const mrPharmacyVisits = pgTable('mr_pharmacy_visits', {
  id: uuid('id').defaultRandom().primaryKey(),
  mrId: uuid('mr_id').notNull().references(() => mrAccounts.id, { onDelete: 'cascade' }),
  pharmacyName: text('pharmacy_name').notNull(),
  phone: text('phone'),
  address: text('address'),
  visitedAt: timestamp('visited_at', { withTimezone: true }).defaultNow().notNull(),
  notes: text('notes'),
  ...timestamps,
}, (t) => [index('mr_visits_mr_idx').on(t.mrId)]);

export const smartOrderSessions = pgTable('smart_order_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  pharmacyTenantId: uuid('pharmacy_tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  rawText: text('raw_text').notNull(),
  parsedJson: text('parsed_json').notNull(),
  recommendationsJson: text('recommendations_json'),
  ...timestamps,
});

export const schema = {
  tenants, users, refreshTokens,
  suppliers, pharmacies, products, productBatches,
  purchases, purchaseItems,
  orders, orderItems,
  bills, billItems,
  payments, paymentAllocations, supplierPayments,
  returns, returnItems,
  pharmacyPurchaseOrders, pharmacyPurchaseOrderItems,
  pharmacyGrns, pharmacyGrnItems,
  customers, retailSales, retailSaleItems,
  payableBills, payableBillItems, payablePayments, payablePaymentAllocations,
  stockistReturns, stockistReturnItems,
  stockistConnections, stockistCatalogItems, stockistPublicCatalogItems, processedCrossTenantEvents, crossTenantEvents,
  ledgerAccounts, ledgerEntries, ledgerLines,
  auditLogs,
  platformUsers, consumerAccounts, consumerAddresses,
  onlineOrders, onlineOrderItems,
  doctorAccounts, consultations,
  mrAccounts, mrPharmacyVisits,
  smartOrderSessions,
};
