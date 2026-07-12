import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../api/client';
import { defaultDashboard, loginPath } from '../../lib/panel';

interface Props {
  children: React.ReactNode;
  accountKind: 'tenant' | 'platform' | 'consumer' | 'doctor' | 'mr';
  requiredTenantType?: 'stockist' | 'pharmacy';
}

const AccountProtectedRoute: React.FC<Props> = ({ children, accountKind, requiredTenantType }) => {
  const { user, initialized, setUser, setInitialized, logout } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get('/auth/me');
        if (!cancelled) setUser(r.data);
      } catch {
        if (!cancelled) await logout();
      }
      if (!cancelled) setInitialized(true);
    })();
    return () => { cancelled = true; };
  }, [setUser, setInitialized, logout]);

  if (!initialized) {
    return <div className="flex items-center justify-center min-h-[200px] text-sm text-slate-500">Loading…</div>;
  }

  if (!user) {
    return <Navigate to={loginPath(accountKind === 'tenant' ? requiredTenantType : accountKind)} state={{ from: location }} replace />;
  }

  const userKind = (user as any).accountKind ?? (user.tenantType === 'stockist' || user.tenantType === 'pharmacy' ? 'tenant' : user.tenantType);

  if (userKind !== accountKind) {
    return <Navigate to={defaultDashboard(userKind, user.tenantType)} replace />;
  }

  if (accountKind === 'tenant' && requiredTenantType && user.tenantType !== requiredTenantType) {
    return <Navigate to={defaultDashboard('tenant', user.tenantType)} replace />;
  }

  return <>{children}</>;
};

export default AccountProtectedRoute;
