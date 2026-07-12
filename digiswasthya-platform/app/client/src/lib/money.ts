/** Parse Postgres numeric strings safely for display/math. */
export function toMoney(v: string | number | undefined | null): number {
  if (v == null || v === '') return 0;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
