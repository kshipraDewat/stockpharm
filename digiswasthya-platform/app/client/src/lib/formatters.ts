export function formatCurrency(amount: number | string | undefined | null): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  if (isNaN(n)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);
}

function parseInputDate(date: string): Date {
  // Keep YYYY-MM-DD dates in local timezone (avoid UTC shift).
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (ymd) {
    const [, y, m, d] = ymd;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(date);
}

export function formatDate(date: string | undefined | null): string {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(parseInputDate(date));
  } catch { return date; }
}

export function formatDateTimeWithTz(date: string | undefined | null): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    const formatted = new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZoneName: 'short',
    }).format(d);
    return formatted;
  } catch { return date; }
}

export function getTimezoneLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value ?? 'local';
  } catch {
    return 'local';
  }
}

export function formatDateShort(date: string | undefined | null): string {
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(parseInputDate(date));
  } catch { return date; }
}

export function formatNumber(n: number | string | undefined | null): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  if (isNaN(num)) return '0';
  return new Intl.NumberFormat('en-IN').format(num);
}

export function toNum(v: string | number | undefined | null): number {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(n) ? 0 : n;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'green', inactive: 'gray', blocked: 'red',
    pending: 'yellow', packed: 'blue', shipped: 'purple',
    delivered: 'green', cancelled: 'red',
    unpaid: 'red', partial: 'yellow', paid: 'green', overdue: 'orange',
    successful: 'green', voided: 'gray', failed: 'red',
    requested: 'yellow', processed: 'green',
    received: 'green',
  };
  return map[status?.toLowerCase()] ?? 'gray';
}

export function gstLabel(isInterstate: boolean): string {
  return isInterstate ? 'IGST' : 'CGST + SGST';
}
