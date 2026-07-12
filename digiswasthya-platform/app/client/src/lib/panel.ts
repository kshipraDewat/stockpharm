export type TenantType = 'stockist' | 'pharmacy';
export type AppPanel = TenantType | 'platform' | 'consumer' | 'doctor' | 'mr';

export function detectPanelFromPath(pathname: string, search: string): AppPanel {
  if (pathname.startsWith('/pharmacy')) return 'pharmacy';
  if (pathname.startsWith('/platform')) return 'platform';
  if (pathname.startsWith('/shop') || pathname.startsWith('/consumer')) return 'consumer';
  if (pathname.startsWith('/doctor')) return 'doctor';
  if (pathname.startsWith('/mr')) return 'mr';
  const params = new URLSearchParams(search);
  const panel = params.get('panel');
  if (panel === 'pharmacy') return 'pharmacy';
  if (panel === 'platform') return 'platform';
  if (panel === 'consumer') return 'consumer';
  if (panel === 'doctor') return 'doctor';
  if (panel === 'mr') return 'mr';
  return 'stockist';
}

export function defaultDashboard(accountKind?: string | null, tenantType?: string | null): string {
  switch (accountKind ?? tenantType) {
    case 'platform': return '/platform/dashboard';
    case 'consumer': return '/shop/dashboard';
    case 'doctor': return '/doctor/dashboard';
    case 'mr': return '/mr/dashboard';
    case 'pharmacy': return '/pharmacy/dashboard';
    default: return '/dashboard';
  }
}

export function loginPath(panel?: AppPanel | string | null): string {
  switch (panel) {
    case 'pharmacy': return '/login?panel=pharmacy';
    case 'platform': return '/platform/login';
    case 'consumer': return '/shop/login';
    case 'doctor': return '/doctor/login';
    case 'mr': return '/mr/login';
    default: return '/login';
  }
}

export function registerPath(panel?: AppPanel | string | null): string {
  switch (panel) {
    case 'pharmacy': return '/register?panel=pharmacy';
    case 'consumer': return '/shop/register';
    case 'doctor': return '/doctor/register';
    case 'mr': return '/mr/register';
    default: return '/register';
  }
}

export function forgotPasswordPath(tenantType?: TenantType | string | null): string {
  return tenantType === 'pharmacy' ? '/pharmacy/forgot-password' : '/forgot-password';
}

export function pharmacyPath(segment: string): string {
  const normalized = segment.startsWith('/') ? segment : `/${segment}`;
  return `/pharmacy${normalized}`;
}

export const PANEL_LABELS: Record<AppPanel, string> = {
  stockist: 'Stockist / Distributor',
  pharmacy: 'Pharmacy',
  platform: 'Platform Admin',
  consumer: 'Customer / Patient',
  doctor: 'Doctor',
  mr: 'Medical Representative',
};
