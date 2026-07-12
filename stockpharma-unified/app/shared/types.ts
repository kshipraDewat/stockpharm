// Single source of truth for all DTOs shared between server and client

export type TenantType = 'stockist' | 'pharmacy';
export type Role = 'admin' | 'biller';
export type PharmacyRole = 'admin' | 'pharmacist' | 'cashier';
export type OrderSource = 'stockist_created' | 'pharmacy_submitted';
export type ConnectionStatus = 'pending' | 'active' | 'rejected' | 'disconnected';
export type AvailabilityHint = 'in_stock' | 'low' | 'out_of_stock';
export type PharmacyPOStatus = 'draft' | 'submitted' | 'accepted' | 'rejected' | 'packed' | 'shipped' | 'delivered' | 'partially_received' | 'received' | 'cancel_requested' | 'cancelled';
export type OrderStatus = 'pending' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
export type BillStatus = 'unpaid' | 'partial' | 'paid' | 'overdue';
export type PaymentMethod = 'cash' | 'upi' | 'bank' | 'cheque';
export type PaymentStatus = 'successful' | 'pending' | 'failed' | 'voided';
export type ReturnStatus = 'requested' | 'processed' | 'cancelled';
export type PurchaseStatus = 'pending' | 'received';
export type PartnerStatus = 'active' | 'inactive' | 'blocked';
export type ScheduleType = 'NONE' | 'H' | 'H1' | 'X' | 'NDPS';
export type LedgerRefType = 'order' | 'bill' | 'payment' | 'return' | 'purchase' | 'adjustment';
export type AccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity';

// Auth
export interface AuthUser {
  id: string;
  tenantId: string;
  tenantType?: TenantType;
  email: string;
  name: string;
  role: Role | PharmacyRole;
}

export interface LoginRequest { email: string; password: string }
export interface LoginResponse { accessToken: string; user: AuthUser }
export interface RegisterRequest {
  businessName: string;
  name: string;
  email: string;
  password: string;
  stateCode: string;
  phone: string;
  gstin?: string;
  dlNumber?: string;
  tenantType?: TenantType;
}

// Tenant
export interface Tenant {
  id: string;
  name: string;
  businessName: string;
  tenantType: TenantType;
  stateCode: string;
  gstin?: string;
  dlNumber?: string;
  addressJson?: Record<string, string>;
  phone: string;
  email: string;
  inviteCode?: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
}

// Pharmacy
export interface Pharmacy {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address: string;
  stateCode: string;
  gstin?: string;
  dlNumber?: string;
  creditLimit: number;
  paymentTermsDays: number;
  status: PartnerStatus;
  outstanding: number;
  openingBalance: number;
  portalConnected?: boolean;
  pharmacyTenantId?: string;
  createdAt: string;
}

export interface PharmacyListItem extends Pick<Pharmacy, 'id' | 'name' | 'contactPerson' | 'phone' | 'status' | 'outstanding' | 'stateCode'> {
  lastOrderDate?: string;
}

// Supplier
export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address: string;
  stateCode: string;
  gstin?: string;
  dlNumber?: string;
  paymentTermsDays: number;
  status: PartnerStatus;
  createdAt: string;
}

// Product
export interface Product {
  id: string;
  name: string;
  genericName?: string;
  manufacturer?: string;
  category: string;
  hsnCode?: string;
  scheduleType: ScheduleType;
  packSize: string;
  baseUnit: string;
  saleUnit: string;
  convFactor: number;
  gstRate: number;
  mrp: number;
  purchaseRate: number;
  saleRate: number;
  minStockLevel: number;
  schemeBase?: number;
  schemeBonus?: number;
  isActive: boolean;
  stock: number;
}

export interface ProductBatch {
  id: string;
  productId: string;
  productName: string;
  supplierId?: string;
  batchNumber: string;
  expiryDate: string;
  mrp: number;
  purchaseRate: number;
  saleRate: number;
  qtyReceived: number;
  qtyOnHand: number;
  receivedAt: string;
}

// Order
export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
  qty: number;
  freeQty: number;
  rate: number;
  gstRate: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  pharmacyId: string;
  pharmacyName: string;
  orderNumber: string;
  orderDate: string;
  status: OrderStatus;
  source?: OrderSource;
  paymentMode: 'credit' | 'cash';
  subtotal: number;
  taxAmount: number;
  total: number;
  isInterstate: boolean;
  placeOfSupply: string;
  notes?: string;
  rejectionReason?: string;
  trackingCarrier?: string;
  trackingAwb?: string;
  shippedAt?: string;
  submittedAt?: string;
  approvedAt?: string;
  externalPharmacyOrderId?: string;
  stockistConnectionId?: string;
  items?: OrderItem[];
  billId?: string;
  createdAt: string;
}

// Stockist ↔ Pharmacy connection
export interface StockistConnection {
  id: string;
  stockistTenantId: string;
  pharmacyTenantId: string;
  stockistName?: string;
  pharmacyName?: string;
  linkedPharmacyId?: string;
  status: ConnectionStatus;
  creditLimit?: number;
  paymentTermsDays?: number;
  rejectionReason?: string;
  connectedAt?: string;
  createdAt: string;
}

export interface StockistCatalogItem {
  id: string;
  connectionId: string;
  stockistProductId: string;
  name: string;
  genericName?: string;
  manufacturer?: string;
  category: string;
  hsnCode?: string;
  scheduleType: ScheduleType;
  packSize: string;
  gstRate: number;
  mrp: number;
  saleRate: number;
  schemeBase?: number;
  schemeBonus?: number;
  availabilityHint: AvailabilityHint;
}

// Bill
export interface BillItem {
  id: string;
  productId: string;
  productName: string;
  hsnCode?: string;
  batchNumber?: string;
  expiryDate?: string;
  qty: number;
  freeQty: number;
  rate: number;
  gstRate: number;
  lineSubtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
}

export interface Bill {
  id: string;
  orderId: string;
  pharmacyId: string;
  pharmacyName: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  isInterstate: boolean;
  placeOfSupply: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  paidAmount: number;
  status: BillStatus;
  items?: BillItem[];
  createdAt: string;
}

// Payment
export interface PaymentAllocation {
  billId: string;
  billNumber: string;
  allocatedAmount: number;
}

export interface Payment {
  id: string;
  pharmacyId: string;
  pharmacyName: string;
  paymentNumber: string;
  paymentDate: string;
  method: PaymentMethod;
  referenceNo?: string;
  amount: number;
  unallocatedAmount: number;
  status: PaymentStatus;
  notes?: string;
  allocations?: PaymentAllocation[];
  createdAt: string;
}

// Purchase
export interface PurchaseItem {
  id: string;
  productId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string;
  qty: number;
  freeQty: number;
  mrp: number;
  purchaseRate: number;
  gstRate: number;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
}

export interface Purchase {
  id: string;
  supplierId: string;
  supplierName: string;
  grnNumber?: string;
  supplierInvoiceNo?: string;
  invoiceDate?: string;
  receivedDate?: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: PurchaseStatus;
  notes?: string;
  items?: PurchaseItem[];
  createdAt: string;
}

// Return
export interface ReturnItem {
  id: string;
  orderItemId?: string;
  productId: string;
  productName: string;
  batchId?: string;
  qty: number;
  rate: number;
  gstRate: number;
  lineTotal: number;
}

export interface Return {
  id: string;
  orderId?: string;
  pharmacyId: string;
  pharmacyName: string;
  returnNumber: string;
  returnDate: string;
  reason: 'expired' | 'damaged' | 'wrong_item' | 'cancelled' | 'other';
  notes?: string;
  totalAmount: number;
  status: ReturnStatus;
  items?: ReturnItem[];
  createdAt: string;
}

// Ledger
export interface LedgerEntry {
  id: string;
  txnDate: string;
  refType: LedgerRefType;
  refId: string;
  narration: string;
  lines: LedgerLine[];
  createdAt: string;
}

export interface LedgerLine {
  id: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

// Audit
export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId?: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

// User (staff)
export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

// Paginated response
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

// Report types
export interface SalesReportData {
  dailySales: { date: string; total: number; orders: number }[];
  topProducts: { productId: string; name: string; qty: number; revenue: number }[];
  topPharmacies: { pharmacyId: string; name: string; revenue: number; orders: number }[];
  byCategory: { category: string; revenue: number }[];
  summary: { total: number; orders: number; avgOrderValue: number };
}

export interface OutstandingReportData {
  aging: {
    current: number; overdue30: number; overdue60: number; overdue90: number; overdue90plus: number;
  };
  topDefaulters: { pharmacyId: string; name: string; outstanding: number; oldestDueDays: number }[];
  bills: { billId: string; billNumber: string; pharmacyName: string; billDate: string; dueDate: string; outstanding: number; ageDays: number }[];
}

export interface GSTReportData {
  month: string;
  sales: { cgst: number; sgst: number; igst: number; taxableValue: number; total: number };
  purchases: { cgstInput: number; sgstInput: number; igstInput: number; taxableValue: number; total: number };
  byRate: { rate: number; taxable: number; cgst: number; sgst: number; igst: number }[];
}

export interface StockAgingItem {
  batchId: string; productId: string; productName: string; batchNumber: string;
  expiryDate: string; qtyOnHand: number; receivedAt: string; ageDays: number;
  mrp: number; purchaseRate: number;
}

export interface RequiredStockItem {
  productId: string; name: string; category: string; currentStock: number;
  minStockLevel: number; deficit: number;
}

export interface ComplianceItem {
  orderId: string; orderDate: string; billNumber?: string;
  pharmacyName: string; pharmacyDl?: string;
  productName: string; scheduleType: ScheduleType;
  batchNumber: string; qty: number;
}

export interface DashboardKpis {
  todaySales: number; monthSales: number; outstandingTotal: number;
  lowStockCount: number; pendingOrders: number; overdueCount: number;
  packBacklogOrders?: number;
  incomingPortalOrders?: number;
  activeConnections?: number;
  recentOrders: Pick<Order, 'id' | 'orderNumber' | 'pharmacyName' | 'total' | 'status' | 'orderDate' | 'source'>[];
  lowStockProducts: Pick<Product, 'id' | 'name' | 'stock' | 'minStockLevel'>[];
}

// AI parse response
export interface AiParsedBill {
  supplierName?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  items: {
    productName: string;
    batchNumber: string;
    expiryDate: string;
    qty: number;
    freeQty: number;
    mrp: number;
    purchaseRate: number;
    gstRate: number;
  }[];
}
