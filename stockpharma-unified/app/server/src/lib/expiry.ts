/** Validate expiry as YYYY-MM-DD, YYYY-MM, or MM/YY. Returns normalized YYYY-MM-DD. */
export function validateExpiryDate(raw: string): string {
  const v = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v);
    if (isNaN(d.getTime())) throw new Error(`Invalid expiry date: ${raw}`);
    return v;
  }
  if (/^\d{4}-\d{2}$/.test(v)) {
    const [y, m] = v.split('-').map(Number);
    if (m < 1 || m > 12) throw new Error(`Invalid expiry date: ${raw}`);
    const lastDay = new Date(y, m, 0).getDate();
    return `${v}-${String(lastDay).padStart(2, '0')}`;
  }
  const mmYy = v.match(/^(\d{1,2})\/(\d{2,4})$/);
  if (mmYy) {
    const month = Number(mmYy[1]);
    let year = Number(mmYy[2]);
    if (mmYy[2].length === 2) year += year < 70 ? 2000 : 1900;
    if (month < 1 || month > 12) throw new Error(`Invalid expiry date: ${raw}`);
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }
  throw new Error(`Invalid expiry date format: ${raw}. Use YYYY-MM, YYYY-MM-DD, or MM/YY`);
}
