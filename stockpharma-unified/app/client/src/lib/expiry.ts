/** Parse expiry strings (ISO, YYYY-MM, MM/YY) to a Date at end-of-month. */
export function parseExpiryDate(expiryStr: string): Date | null {
  const v = expiryStr.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4}-\d{2}$/.test(v)) {
    const [year, month] = v.split('-').map(Number);
    return new Date(year, month, 0);
  }
  const mmYy = v.match(/^(\d{1,2})\/(\d{2,4})$/);
  if (mmYy) {
    const month = Number(mmYy[1]);
    let year = Number(mmYy[2]);
    if (mmYy[2].length === 2) year += year < 70 ? 2000 : 1900;
    if (month < 1 || month > 12) return null;
    return new Date(year, month, 0);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function daysUntilExpiry(expiryStr: string): number | null {
  const exp = parseExpiryDate(expiryStr);
  if (!exp) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export type ExpiryTier = 'expired' | 'critical' | 'warning' | 'ok';

export function expiryTier(expiryStr: string): ExpiryTier {
  const days = daysUntilExpiry(expiryStr);
  if (days === null) return 'ok';
  if (days < 0) return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 90) return 'warning';
  return 'ok';
}

export function expiryTierClass(tier: ExpiryTier): string {
  switch (tier) {
    case 'expired': return 'text-red-700 bg-red-50';
    case 'critical': return 'text-red-600 bg-red-50';
    case 'warning': return 'text-amber-700 bg-amber-50';
    default: return 'text-green-700 bg-green-50';
  }
}
