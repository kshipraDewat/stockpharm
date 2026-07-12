export const INDIA_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '27': 'Maharashtra', '29': 'Karnataka', '32': 'Kerala',
  '33': 'Tamil Nadu', '36': 'Telangana', '37': 'Andhra Pradesh',
};

export const GST_RATES = [0, 5, 12, 18, 28] as const;

export const SCHEDULE_TYPES = ['NONE', 'H', 'H1', 'X', 'NDPS'] as const;

export const LEDGER_ACCOUNT_CODES = {
  CASH: 'CASH',
  BANK: 'BANK',
  UPI: 'UPI_SUSPENSE',
  SUNDRY_DEBTORS: 'SUNDRY_DEBTORS',
  SUNDRY_CREDITORS: 'SUNDRY_CREDITORS',
  INVENTORY: 'INVENTORY',
  // M21: suspense bucket used between GRN (Inventory Dr / GRN_CLEARING Cr) and
  // the matching payable bill (GRN_CLEARING Dr + GST_INPUT Dr / Creditors Cr).
  // Keeps inventory and AP in sync regardless of which side arrives first.
  GRN_CLEARING: 'GRN_CLEARING',
  SALES: 'SALES',
  SALES_RETURNS: 'SALES_RETURNS',
  PURCHASES: 'PURCHASES',
  CGST_OUTPUT: 'CGST_OUTPUT',
  SGST_OUTPUT: 'SGST_OUTPUT',
  IGST_OUTPUT: 'IGST_OUTPUT',
  CGST_INPUT: 'CGST_INPUT',
  SGST_INPUT: 'SGST_INPUT',
  IGST_INPUT: 'IGST_INPUT',
} as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_CREDIT_LIMIT = 50000;
