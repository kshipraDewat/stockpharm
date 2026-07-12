/** Match nav paths without prefix-collision false positives. */
export function isNavActive(pathname: string, path: string, search = ''): boolean {
  if (path.includes('?')) {
    const [base, query] = path.split('?');
    const pathMatch = pathname === base || pathname.startsWith(`${base}/`);
    if (!pathMatch) return false;
    const expected = new URLSearchParams(query);
    const actual = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    for (const [key, value] of expected.entries()) {
      if (actual.get(key) !== value) return false;
    }
    return true;
  }
  if (path === '/dashboard' || path === '/pharmacy/dashboard') {
    return pathname === path;
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
