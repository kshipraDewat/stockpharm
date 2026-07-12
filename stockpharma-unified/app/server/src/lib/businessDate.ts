/** Business calendar date (YYYY-MM-DD) in Asia/Kolkata — used for same-day void rules. */
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
