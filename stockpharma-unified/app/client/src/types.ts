// --- General Types ---

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'staff';
  businessName?: string;
}

export interface Pharmacy {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  dlNumber: string;
  gstNumber: string;
  outstanding: number;
  status: 'Active' | 'Inactive' | 'Blocked';
  lastOrderDate?: string;
  creationDate: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  hsnCode: string;
  mrp: number;
  ptr?: number;
  purchaseRate: number;
  salePrice: number;
  gstRate: number; 
  gst?: number;
  stock: number;
  minStockLevel: number;
  expiryDate: string;
  expiry?: string;
  batchNumber: string;
  batch?: string;
  schemeBase?: number;
  schemeBonus?: number;
}

export interface Order {
  id: string;
  pharmacyId: string;
  pharmacyName: string;
  date: string;
  amount: number;
  status: 'Pending' | 'Committed' | 'Packed' | 'Shipped' | 'Delivered' | 'Cancelled';
  paymentStatus: 'Unpaid' | 'Partial' | 'Paid';
  itemsCount: number;
  items?: OrderItem[];
}

export interface OrderItem {
  id?: string;
  productId: string;
  productName: string;
  name?: string;
  quantity: number;
  qty?: number;
  free?: number;
  rate: number;
  amount: number;
  batchNumber: string;
  batch?: string;
  expiry?: string;
  schemeBase?: number;
  schemeBonus?: number;
  mrp?: number;
  gst?: number;
}

export interface Bill {
  id: string;
  orderId: string;
  pharmacyId: string;
  pharmacyName: string;
  date: string;
  amount: number;
  taxAmount: number;
  status: 'Unpaid' | 'Paid' | 'Partial' | 'Overdue';
  dueDate: string;
}

export interface Payment {
  id: string;
  pharmacyId: string;
  pharmacyName: string;
  amount: number;
  date: string;
  method: 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI';
  referenceNo: string;
  status: 'Successful' | 'Pending' | 'Failed';
}

export interface Return {
  id: string;
  orderId: string;
  pharmacyId: string;
  pharmacyName: string;
  amount: number;
  date: string;
  status: 'Requested' | 'Processed' | 'Cancelled';
  items?: any[];
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  outstanding: number;
  status: 'Active' | 'Inactive';
}

export interface PurchaseItem {
  id: string;
  product: string;
  batch: string;
  expiry: string;
  qty: number;
  freeQty: number;
  mrp: number;
  ptg: number;
  gst: number;
}

export interface Purchase {
  id: string;
  grnNumber: string;
  supplier: string;
  supplierInvoice: string;
  date: string;
  totalAmount: number;
  status: 'received' | 'pending';
  items: PurchaseItem[];
}

export interface AuditLog {
  id: string;
  user: string;
  action: string;
  entity: string;
  timestamp: string;
  details: string;
}
