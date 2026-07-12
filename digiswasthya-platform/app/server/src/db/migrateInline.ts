import { getDb } from './client.js';

// PostgreSQL DDL for PGlite (which is Postgres-based, not SQLite)
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    business_name TEXT NOT NULL,
    state_code TEXT NOT NULL DEFAULT '08',
    gstin TEXT,
    dl_number TEXT,
    address_json TEXT,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'biller',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email ON users(tenant_id, email)`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT NOT NULL,
    state_code TEXT NOT NULL,
    gstin TEXT,
    dl_number TEXT,
    payment_terms_days INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pharmacies (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT NOT NULL,
    state_code TEXT NOT NULL,
    gstin TEXT,
    dl_number TEXT,
    credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
    payment_terms_days INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'active',
    outstanding NUMERIC(14,2) NOT NULL DEFAULT 0,
    opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    generic_name TEXT,
    manufacturer TEXT,
    category TEXT NOT NULL,
    hsn_code TEXT,
    schedule_type TEXT NOT NULL DEFAULT 'NONE',
    pack_size TEXT NOT NULL DEFAULT '1',
    base_unit TEXT NOT NULL DEFAULT 'Tab',
    sale_unit TEXT NOT NULL DEFAULT 'Strip',
    conv_factor INTEGER NOT NULL DEFAULT 10,
    gst_rate NUMERIC(5,2) NOT NULL DEFAULT 12,
    mrp NUMERIC(14,2) NOT NULL,
    purchase_rate NUMERIC(14,2) NOT NULL,
    sale_rate NUMERIC(14,2) NOT NULL,
    min_stock_level INTEGER NOT NULL DEFAULT 10,
    scheme_base INTEGER,
    scheme_bonus INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS product_batches (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    supplier_id TEXT REFERENCES suppliers(id),
    source_purchase_id TEXT,
    batch_number TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    mrp NUMERIC(14,2) NOT NULL,
    purchase_rate NUMERIC(14,2) NOT NULL,
    sale_rate NUMERIC(14,2) NOT NULL,
    qty_received INTEGER NOT NULL,
    qty_on_hand INTEGER NOT NULL,
    received_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  // C11: prevent duplicate batch rows for the same product/batch/expiry.
  `CREATE UNIQUE INDEX IF NOT EXISTS product_batches_product_batch_expiry_unique
     ON product_batches(tenant_id, product_id, batch_number, expiry_date)`,
  // me81: FEFO/aging queries filter on expiry_date.
  `CREATE INDEX IF NOT EXISTS product_batches_expiry_date_idx ON product_batches(expiry_date)`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    grn_number TEXT,
    supplier_invoice_no TEXT,
    invoice_date TEXT,
    received_date TEXT,
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_number TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    qty INTEGER NOT NULL,
    free_qty INTEGER NOT NULL DEFAULT 0,
    mrp NUMERIC(14,2) NOT NULL,
    purchase_rate NUMERIC(14,2) NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL,
    line_subtotal NUMERIC(14,2) NOT NULL,
    line_tax NUMERIC(14,2) NOT NULL,
    line_total NUMERIC(14,2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    order_number TEXT NOT NULL,
    order_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_mode TEXT NOT NULL DEFAULT 'credit',
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_interstate BOOLEAN NOT NULL DEFAULT false,
    place_of_supply TEXT NOT NULL DEFAULT '08',
    notes TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_number_tenant ON orders(tenant_id, order_number)`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_id TEXT REFERENCES product_batches(id),
    qty INTEGER NOT NULL,
    free_qty INTEGER NOT NULL DEFAULT 0,
    rate NUMERIC(14,2) NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL,
    line_subtotal NUMERIC(14,2) NOT NULL,
    line_tax NUMERIC(14,2) NOT NULL,
    line_total NUMERIC(14,2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES orders(id),
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    bill_number TEXT NOT NULL,
    bill_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    is_interstate BOOLEAN NOT NULL DEFAULT false,
    place_of_supply TEXT NOT NULL DEFAULT '08',
    subtotal NUMERIC(14,2) NOT NULL,
    cgst NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL,
    paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unpaid',
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS bills_number_tenant ON bills(tenant_id, bill_number)`,
  // C6: one bill per order.
  `CREATE UNIQUE INDEX IF NOT EXISTS bills_order_id_unique ON bills(order_id)`,
  // me81: filter-column indexes used by overdue / dashboard queries.
  `CREATE INDEX IF NOT EXISTS bills_due_date_idx ON bills(due_date)`,
  `CREATE INDEX IF NOT EXISTS bills_status_idx ON bills(status)`,
  `CREATE TABLE IF NOT EXISTS bill_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_id TEXT REFERENCES product_batches(id),
    qty INTEGER NOT NULL,
    free_qty INTEGER NOT NULL DEFAULT 0,
    rate NUMERIC(14,2) NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL,
    line_subtotal NUMERIC(14,2) NOT NULL,
    cgst NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(14,2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    payment_number TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    method TEXT NOT NULL,
    reference_no TEXT,
    amount NUMERIC(14,2) NOT NULL,
    unallocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'successful',
    notes TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payment_allocations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    bill_id TEXT NOT NULL REFERENCES bills(id),
    allocated_amount NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  // me81: speed up "payments for this bill" lookup used on bill detail pages.
  `CREATE INDEX IF NOT EXISTS payment_allocations_bill_id_idx ON payment_allocations(bill_id)`,
  `CREATE INDEX IF NOT EXISTS payment_allocations_payment_id_idx ON payment_allocations(payment_id)`,
  // C23: per-consumer idempotency log so re-delivered events don't double-apply
  // payments/returns/bills.
  `CREATE TABLE IF NOT EXISTS processed_cross_tenant_events (
    tenant_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (tenant_id, event_id)
  )`,
  // C24: canonical stock-mutation ledger.
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    batch_id TEXT REFERENCES product_batches(id) ON DELETE SET NULL,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref_type TEXT NOT NULL,
    ref_id TEXT,
    ref_number TEXT,
    notes TEXT,
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS stock_movements_tenant_idx ON stock_movements(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_batch_idx ON stock_movements(batch_id)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements(product_id)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_ref_idx ON stock_movements(ref_type, ref_id)`,
  `CREATE TABLE IF NOT EXISTS supplier_payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    payment_number TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    method TEXT NOT NULL,
    reference_no TEXT,
    amount NUMERIC(14,2) NOT NULL,
    notes TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS supplier_payments_tenant_id_idx ON supplier_payments(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS supplier_payments_supplier_id_idx ON supplier_payments(supplier_id)`,
  `CREATE TABLE IF NOT EXISTS returns (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES orders(id),
    pharmacy_id TEXT NOT NULL REFERENCES pharmacies(id),
    return_number TEXT NOT NULL,
    return_date TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'other',
    notes TEXT,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'requested',
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS return_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    return_id TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    order_item_id TEXT REFERENCES order_items(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_id TEXT REFERENCES product_batches(id),
    qty INTEGER NOT NULL,
    rate NUMERIC(14,2) NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL,
    line_total NUMERIC(14,2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ledger_accounts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    parent_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(tenant_id, code)
  )`,
  `CREATE TABLE IF NOT EXISTS ledger_entries (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    txn_date TEXT NOT NULL,
    ref_type TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    narration TEXT NOT NULL,
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ledger_lines (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    entry_id TEXT NOT NULL REFERENCES ledger_entries(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
    partner_type TEXT,
    partner_id TEXT,
    debit NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit NUMERIC(14,2) NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL,
    user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    before_json TEXT,
    after_json TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notifications_json TEXT`,
  `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS invoice_file_url TEXT`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id)`,
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tenant_type TEXT NOT NULL DEFAULT 'stockist'`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invite_code TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenants_invite_code_unique ON tenants(invite_code) WHERE invite_code IS NOT NULL`,
  `ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS portal_connected BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS pharmacy_tenant_id TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'stockist_created'`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_pharmacy_order_id TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS stockist_connection_id TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_carrier TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_awb TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_by TEXT REFERENCES users(id)`,
  `CREATE TABLE IF NOT EXISTS stockist_connections (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    stockist_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pharmacy_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    linked_pharmacy_id TEXT REFERENCES pharmacies(id),
    status TEXT NOT NULL DEFAULT 'pending',
    credit_limit NUMERIC(14,2),
    payment_terms_days INTEGER,
    rejection_reason TEXT,
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(stockist_tenant_id, pharmacy_tenant_id)
  )`,
  `CREATE INDEX IF NOT EXISTS connections_stockist_idx ON stockist_connections(stockist_tenant_id)`,
  `CREATE INDEX IF NOT EXISTS connections_pharmacy_idx ON stockist_connections(pharmacy_tenant_id)`,
  `CREATE TABLE IF NOT EXISTS stockist_catalog_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    connection_id TEXT NOT NULL REFERENCES stockist_connections(id) ON DELETE CASCADE,
    stockist_product_id TEXT NOT NULL,
    pharmacy_tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    generic_name TEXT,
    manufacturer TEXT,
    category TEXT NOT NULL,
    hsn_code TEXT,
    schedule_type TEXT NOT NULL DEFAULT 'NONE',
    pack_size TEXT NOT NULL DEFAULT '1',
    gst_rate NUMERIC(5,2) NOT NULL,
    mrp NUMERIC(14,2) NOT NULL,
    sale_rate NUMERIC(14,2) NOT NULL,
    scheme_base INTEGER,
    scheme_bonus INTEGER,
    availability_hint TEXT NOT NULL DEFAULT 'in_stock',
    local_product_id TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(connection_id, stockist_product_id)
  )`,
  `CREATE TABLE IF NOT EXISTS cross_tenant_events (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    source_tenant_id TEXT NOT NULL,
    target_tenant_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS cross_events_target_idx ON cross_tenant_events(target_tenant_id, delivered_at)`,
  `CREATE TABLE IF NOT EXISTS pharmacy_purchase_orders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stockist_connection_id TEXT NOT NULL REFERENCES stockist_connections(id),
    po_number TEXT NOT NULL,
    order_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    payment_mode TEXT NOT NULL DEFAULT 'credit',
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes TEXT,
    external_order_id TEXT,
    rejection_reason TEXT,
    tracking_carrier TEXT,
    tracking_awb TEXT,
    shipped_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(tenant_id, po_number)
  )`,
  `CREATE TABLE IF NOT EXISTS pharmacy_purchase_order_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    purchase_order_id TEXT NOT NULL REFERENCES pharmacy_purchase_orders(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    catalog_item_id TEXT,
    stockist_product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    free_qty INTEGER NOT NULL DEFAULT 0,
    received_qty INTEGER NOT NULL DEFAULT 0,
    rate NUMERIC(14,2) NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL,
    line_subtotal NUMERIC(14,2) NOT NULL,
    line_tax NUMERIC(14,2) NOT NULL,
    line_total NUMERIC(14,2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pharmacy_grns (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    purchase_order_id TEXT NOT NULL REFERENCES pharmacy_purchase_orders(id),
    stockist_connection_id TEXT NOT NULL REFERENCES stockist_connections(id),
    grn_number TEXT NOT NULL,
    received_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    notes TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(tenant_id, grn_number)
  )`,
  `CREATE TABLE IF NOT EXISTS pharmacy_grn_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    grn_id TEXT NOT NULL REFERENCES pharmacy_grns(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    purchase_order_item_id TEXT REFERENCES pharmacy_purchase_order_items(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_id TEXT REFERENCES product_batches(id),
    batch_number TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    qty INTEGER NOT NULL,
    free_qty INTEGER NOT NULL DEFAULT 0,
    mrp NUMERIC(14,2) NOT NULL,
    purchase_rate NUMERIC(14,2) NOT NULL,
    sale_rate NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    age INTEGER,
    gender TEXT,
    allergies TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS retail_sales (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_number TEXT NOT NULL,
    sale_date TEXT NOT NULL,
    customer_id TEXT REFERENCES customers(id),
    payment_method TEXT NOT NULL DEFAULT 'cash',
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    amount_received NUMERIC(14,2) NOT NULL DEFAULT 0,
    change_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed',
    cashier_id TEXT REFERENCES users(id),
    voided_at TIMESTAMPTZ,
    voided_by TEXT REFERENCES users(id),
    void_reason TEXT,
    notes TEXT,
    rx_number TEXT,
    doctor_name TEXT,
    doctor_reg_no TEXT,
    patient_name TEXT,
    patient_age INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(tenant_id, sale_number)
  )`,
  // C26: add prescription columns for existing retail_sales tables.
  `ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS void_reason TEXT`,
  `ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS rx_number TEXT`,
  `ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS doctor_name TEXT`,
  `ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS doctor_reg_no TEXT`,
  `ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS patient_name TEXT`,
  `ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS patient_age INTEGER`,
  `ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS payment_breakdown_json TEXT`,
  `CREATE TABLE IF NOT EXISTS retail_sale_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    sale_id TEXT NOT NULL REFERENCES retail_sales(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_id TEXT NOT NULL REFERENCES product_batches(id),
    batch_number TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    qty INTEGER NOT NULL,
    rate NUMERIC(14,2) NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL,
    discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    line_subtotal NUMERIC(14,2) NOT NULL,
    line_tax NUMERIC(14,2) NOT NULL,
    line_total NUMERIC(14,2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payable_bills (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stockist_connection_id TEXT NOT NULL REFERENCES stockist_connections(id),
    purchase_order_id TEXT REFERENCES pharmacy_purchase_orders(id),
    external_bill_id TEXT,
    external_order_id TEXT,
    bill_number TEXT NOT NULL,
    stockist_name TEXT NOT NULL,
    bill_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    is_interstate BOOLEAN NOT NULL DEFAULT false,
    place_of_supply TEXT NOT NULL DEFAULT '08',
    subtotal NUMERIC(14,2) NOT NULL,
    cgst NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL,
    paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unpaid',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(tenant_id, bill_number)
  )`,
  `CREATE TABLE IF NOT EXISTS payable_bill_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    bill_id TEXT NOT NULL REFERENCES payable_bills(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    product_id TEXT REFERENCES products(id),
    external_product_id TEXT,
    product_name TEXT NOT NULL,
    batch_number TEXT,
    expiry_date TEXT,
    qty INTEGER NOT NULL,
    free_qty INTEGER NOT NULL DEFAULT 0,
    rate NUMERIC(14,2) NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL,
    line_subtotal NUMERIC(14,2) NOT NULL,
    cgst NUMERIC(14,2) NOT NULL DEFAULT 0,
    sgst NUMERIC(14,2) NOT NULL DEFAULT 0,
    igst NUMERIC(14,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(14,2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payable_payments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stockist_connection_id TEXT NOT NULL REFERENCES stockist_connections(id),
    payment_number TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    method TEXT NOT NULL,
    reference_no TEXT,
    amount NUMERIC(14,2) NOT NULL,
    unallocated_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'successful',
    notes TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payable_payment_allocations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    payment_id TEXT NOT NULL REFERENCES payable_payments(id) ON DELETE CASCADE,
    bill_id TEXT NOT NULL REFERENCES payable_bills(id),
    allocated_amount NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS stockist_returns (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stockist_connection_id TEXT NOT NULL REFERENCES stockist_connections(id),
    purchase_order_id TEXT REFERENCES pharmacy_purchase_orders(id),
    payable_bill_id TEXT REFERENCES payable_bills(id),
    external_return_id TEXT,
    return_number TEXT NOT NULL,
    return_date TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'other',
    notes TEXT,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'requested',
    rejection_reason TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `ALTER TABLE stockist_returns ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
  `CREATE TABLE IF NOT EXISTS stockist_return_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    return_id TEXT NOT NULL REFERENCES stockist_returns(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_id TEXT REFERENCES product_batches(id),
    qty INTEGER NOT NULL,
    rate NUMERIC(14,2) NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL,
    line_total NUMERIC(14,2) NOT NULL
  )`,
  `DO $$ BEGIN
    ALTER TABLE product_batches ADD CONSTRAINT product_batches_source_purchase_fk
      FOREIGN KEY (source_purchase_id) REFERENCES purchases(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_publicly_listed BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS accepting_new_connections BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS public_slug TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS about_text TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS coverage_state_codes TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS categories TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tenants_public_slug_unique ON tenants(public_slug) WHERE public_slug IS NOT NULL`,
  `ALTER TABLE stockist_connections ADD COLUMN IF NOT EXISTS request_source TEXT`,
  `ALTER TABLE stockist_connections ADD COLUMN IF NOT EXISTS request_note TEXT`,
  `ALTER TABLE stockist_connections ADD COLUMN IF NOT EXISTS expected_monthly_volume INTEGER`,
  `CREATE TABLE IF NOT EXISTS stockist_public_catalog_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    stockist_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL,
    generic_name TEXT,
    manufacturer TEXT,
    category TEXT NOT NULL,
    hsn_code TEXT,
    schedule_type TEXT NOT NULL DEFAULT 'NONE',
    pack_size TEXT NOT NULL DEFAULT '1',
    gst_rate NUMERIC(5,2) NOT NULL,
    mrp NUMERIC(14,2) NOT NULL,
    sale_rate NUMERIC(14,2),
    availability_hint TEXT NOT NULL DEFAULT 'in_stock',
    is_public BOOLEAN NOT NULL DEFAULT true,
    synced_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(stockist_tenant_id, product_id)
  )`,
  `CREATE INDEX IF NOT EXISTS public_catalog_stockist_idx ON stockist_public_catalog_items(stockist_tenant_id)`,
  // S01: FK-constrain denormalized tenant_id on child tables (idempotent via migrate catch).
  `ALTER TABLE purchase_items ADD CONSTRAINT purchase_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE order_items ADD CONSTRAINT order_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE bill_items ADD CONSTRAINT bill_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE return_items ADD CONSTRAINT return_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE ledger_lines ADD CONSTRAINT ledger_lines_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE pharmacy_purchase_order_items ADD CONSTRAINT pharmacy_po_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE pharmacy_grn_items ADD CONSTRAINT pharmacy_grn_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE retail_sale_items ADD CONSTRAINT retail_sale_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE payable_bill_items ADD CONSTRAINT payable_bill_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE stockist_return_items ADD CONSTRAINT stockist_return_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
  `ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`,
  // S02: composite (tenant_id, id) parent indexes + tenant-scoped child FKs.
  // Skipped (by design): stockist_public_catalog_items.product_id (denormalized catalog snapshot),
  // stockist_catalog_items.stockist_product_id (opaque stockist SKU, not products.id),
  // pharmacy_purchase_order_items (references stockist catalog, not local products),
  // stockist_connections.linked_pharmacy_id (cross-tenant link without matching tenant_id column),
  // ledger_lines.account_id (chart-of-accounts codes are tenant-scoped but not composite-FK wired here).
  `CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_id_unique ON products(tenant_id, id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS product_batches_tenant_id_unique ON product_batches(tenant_id, id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pharmacies_tenant_id_unique ON pharmacies(tenant_id, id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS suppliers_tenant_id_unique ON suppliers(tenant_id, id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS purchases_tenant_id_unique ON purchases(tenant_id, id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_id_unique ON orders(tenant_id, id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS bills_tenant_id_unique ON bills(tenant_id, id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS returns_tenant_id_unique ON returns(tenant_id, id)`,
  `DO $$ BEGIN
    ALTER TABLE product_batches DROP CONSTRAINT IF EXISTS product_batches_product_id_fkey;
    ALTER TABLE product_batches ADD CONSTRAINT product_batches_product_tenant_fk
      FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE product_batches DROP CONSTRAINT IF EXISTS product_batches_supplier_id_fkey;
    ALTER TABLE product_batches ADD CONSTRAINT product_batches_supplier_tenant_fk
      FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_supplier_id_fkey;
    ALTER TABLE purchases ADD CONSTRAINT purchases_supplier_tenant_fk
      FOREIGN KEY (tenant_id, supplier_id) REFERENCES suppliers(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_pharmacy_id_fkey;
    ALTER TABLE orders ADD CONSTRAINT orders_pharmacy_tenant_fk
      FOREIGN KEY (tenant_id, pharmacy_id) REFERENCES pharmacies(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_pharmacy_id_fkey;
    ALTER TABLE bills ADD CONSTRAINT bills_pharmacy_tenant_fk
      FOREIGN KEY (tenant_id, pharmacy_id) REFERENCES pharmacies(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_pharmacy_id_fkey;
    ALTER TABLE returns ADD CONSTRAINT returns_pharmacy_tenant_fk
      FOREIGN KEY (tenant_id, pharmacy_id) REFERENCES pharmacies(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_pharmacy_id_fkey;
    ALTER TABLE payments ADD CONSTRAINT payments_pharmacy_tenant_fk
      FOREIGN KEY (tenant_id, pharmacy_id) REFERENCES pharmacies(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS payments_tenant_id_unique ON payments(tenant_id, id)`,
  `DO $$ BEGIN
    ALTER TABLE purchase_items DROP CONSTRAINT IF EXISTS purchase_items_product_id_fkey;
    ALTER TABLE purchase_items ADD CONSTRAINT purchase_items_product_tenant_fk
      FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
    ALTER TABLE order_items ADD CONSTRAINT order_items_product_tenant_fk
      FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_batch_id_fkey;
    ALTER TABLE order_items ADD CONSTRAINT order_items_batch_tenant_fk
      FOREIGN KEY (tenant_id, batch_id) REFERENCES product_batches(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE bill_items DROP CONSTRAINT IF EXISTS bill_items_product_id_fkey;
    ALTER TABLE bill_items ADD CONSTRAINT bill_items_product_tenant_fk
      FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE bill_items DROP CONSTRAINT IF EXISTS bill_items_batch_id_fkey;
    ALTER TABLE bill_items ADD CONSTRAINT bill_items_batch_tenant_fk
      FOREIGN KEY (tenant_id, batch_id) REFERENCES product_batches(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE return_items DROP CONSTRAINT IF EXISTS return_items_product_id_fkey;
    ALTER TABLE return_items ADD CONSTRAINT return_items_product_tenant_fk
      FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE return_items DROP CONSTRAINT IF EXISTS return_items_batch_id_fkey;
    ALTER TABLE return_items ADD CONSTRAINT return_items_batch_tenant_fk
      FOREIGN KEY (tenant_id, batch_id) REFERENCES product_batches(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_product_id_fkey;
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_product_tenant_fk
      FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_batch_id_fkey;
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_batch_tenant_fk
      FOREIGN KEY (tenant_id, batch_id) REFERENCES product_batches(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE retail_sale_items DROP CONSTRAINT IF EXISTS retail_sale_items_product_id_fkey;
    ALTER TABLE retail_sale_items ADD CONSTRAINT retail_sale_items_product_tenant_fk
      FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE retail_sale_items DROP CONSTRAINT IF EXISTS retail_sale_items_batch_id_fkey;
    ALTER TABLE retail_sale_items ADD CONSTRAINT retail_sale_items_batch_tenant_fk
      FOREIGN KEY (tenant_id, batch_id) REFERENCES product_batches(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE pharmacy_grn_items DROP CONSTRAINT IF EXISTS pharmacy_grn_items_product_id_fkey;
    ALTER TABLE pharmacy_grn_items ADD CONSTRAINT pharmacy_grn_items_product_tenant_fk
      FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE pharmacy_grn_items DROP CONSTRAINT IF EXISTS pharmacy_grn_items_batch_id_fkey;
    ALTER TABLE pharmacy_grn_items ADD CONSTRAINT pharmacy_grn_items_batch_tenant_fk
      FOREIGN KEY (tenant_id, batch_id) REFERENCES product_batches(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE stockist_return_items DROP CONSTRAINT IF EXISTS stockist_return_items_product_id_fkey;
    ALTER TABLE stockist_return_items ADD CONSTRAINT stockist_return_items_product_tenant_fk
      FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE stockist_return_items DROP CONSTRAINT IF EXISTS stockist_return_items_batch_id_fkey;
    ALTER TABLE stockist_return_items ADD CONSTRAINT stockist_return_items_batch_tenant_fk
      FOREIGN KEY (tenant_id, batch_id) REFERENCES product_batches(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE payable_bill_items DROP CONSTRAINT IF EXISTS payable_bill_items_product_id_fkey;
    ALTER TABLE payable_bill_items ADD CONSTRAINT payable_bill_items_product_tenant_fk
      FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  // ─── Unified platform extensions ─────────────────────────────────────────
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_type TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pan_number TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS whatsapp TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS city TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pin_code TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_account_json TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS documents_json TEXT`,
  `CREATE TABLE IF NOT EXISTS platform_users (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'super_admin',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS consumer_accounts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS consumer_addresses (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    consumer_id TEXT NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'Home',
    address_line TEXT NOT NULL,
    city TEXT NOT NULL,
    pin_code TEXT NOT NULL,
    state_code TEXT NOT NULL DEFAULT '08',
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS online_orders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    pharmacy_tenant_id TEXT NOT NULL REFERENCES tenants(id),
    consumer_id TEXT NOT NULL REFERENCES consumer_accounts(id),
    order_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'placed',
    payment_mode TEXT NOT NULL DEFAULT 'cod',
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    total NUMERIC(14,2) NOT NULL DEFAULT 0,
    delivery_address_json TEXT,
    prescription_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS online_orders_number_unique ON online_orders(pharmacy_tenant_id, order_number)`,
  `CREATE TABLE IF NOT EXISTS online_order_items (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    order_id TEXT NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL DEFAULT 12,
    line_total NUMERIC(14,2) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS doctor_accounts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    specialization TEXT,
    registration_no TEXT,
    phone TEXT,
    consultation_fee_audio NUMERIC(10,2) DEFAULT 300,
    consultation_fee_video NUMERIC(10,2) DEFAULT 500,
    consultation_fee_clinic NUMERIC(10,2) DEFAULT 200,
    approval_status TEXT NOT NULL DEFAULT 'pending',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS consultations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    doctor_id TEXT NOT NULL REFERENCES doctor_accounts(id),
    consumer_id TEXT NOT NULL REFERENCES consumer_accounts(id),
    pharmacy_tenant_id TEXT REFERENCES tenants(id),
    mode TEXT NOT NULL DEFAULT 'video',
    status TEXT NOT NULL DEFAULT 'scheduled',
    scheduled_at TIMESTAMPTZ,
    fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    notes TEXT,
    prescription_json TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mr_accounts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    phone TEXT,
    territory TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mr_pharmacy_visits (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    mr_id TEXT NOT NULL REFERENCES mr_accounts(id) ON DELETE CASCADE,
    pharmacy_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    visited_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS smart_order_sessions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    pharmacy_tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    raw_text TEXT NOT NULL,
    parsed_json TEXT NOT NULL,
    recommendations_json TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
  )`,
];

export async function migrate() {
  const db = await getDb();
  const client = (db as any).$client;

  for (const stmt of STATEMENTS) {
    try {
      if (client?.exec) {
        await client.exec(stmt);
      } else {
        await (db as any).execute(stmt);
      }
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (!msg.includes('already exists') && !msg.includes('duplicate')) {
        console.warn('Migration warning:', msg.slice(0, 150));
      }
    }
  }
  console.log('Schema ready.');
}
