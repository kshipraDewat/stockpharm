const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const STATE_CODE_RE = /^\d{2}$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const HSN_RE = /^\d{4,8}$/;

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required';
  if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address';
  return null;
}

export function validatePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (!digits) return 'Phone is required';
  if (!PHONE_RE.test(digits)) return 'Enter a valid 10-digit mobile number';
  return null;
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

export function validateStateCode(code: string): string | null {
  if (!STATE_CODE_RE.test(code.trim())) return 'State code must be exactly 2 digits';
  return null;
}

export function validateGstin(gstin: string, required = false): string | null {
  const v = gstin.trim().toUpperCase();
  if (!v) return required ? 'GSTIN is required' : null;
  if (!GSTIN_RE.test(v)) return 'Enter a valid 15-character GSTIN';
  return null;
}

export function validatePassword(password: string, minLen = 8): string | null {
  if (password.length < minLen) return `Password must be at least ${minLen} characters`;
  if (!/[A-Z]/.test(password)) return 'Password must include an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must include a lowercase letter';
  if (!/\d/.test(password)) return 'Password must include a digit';
  return null;
}

export function passwordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score <= 4) return { score, label: 'Fair', color: 'bg-amber-500' };
  return { score, label: 'Strong', color: 'bg-green-500' };
}

export function validateHsn(hsn: string): string | null {
  const v = hsn.trim();
  if (!v) return null;
  if (!HSN_RE.test(v)) return 'HSN must be 4–8 digits';
  return null;
}

export function validateProductPrices(mrp: number, purchaseRate: number, saleRate: number): string | null {
  if (purchaseRate > mrp) return 'Purchase rate cannot exceed MRP';
  if (saleRate > mrp) return 'Sale rate cannot exceed MRP';
  if (saleRate < purchaseRate) return 'Sale rate should not be below purchase rate';
  return null;
}

/** Convert AI-parsed MM/YY or MM/YYYY to ISO YYYY-MM-DD (last day of month). */
export function parseExpiryToIso(raw: string): string {
  const v = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const mmYy = v.match(/^(\d{1,2})\/(\d{2,4})$/);
  if (mmYy) {
    const month = mmYy[1].padStart(2, '0');
    let year = mmYy[2];
    if (year.length === 2) year = `20${year}`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    return `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  }
  return v;
}
