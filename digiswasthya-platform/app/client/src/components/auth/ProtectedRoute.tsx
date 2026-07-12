import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore, type AuthUser, type UserRole } from '../../stores/authStore';
import { api } from '../../api/client';
import { defaultDashboard } from '../../lib/panel';
import type { TenantType } from '../../lib/panel';

interface Props {
  children: React.ReactNode;
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
  requiredTenantType?: TenantType;
  deniedRedirect?: string;
}

const ProtectedRoute: React.FC<Props> = ({ children, requiredRole, allowedRoles, requiredTenantType, deniedRedirect }) => {
  const { user, initialized, setUser, setInitialized, logout } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      const isPharmacyRoute = location.pathname.startsWith('/pharmacy');
      try {
        const r = await api.get('/auth/me');
        if (!cancelled) setUser(r.data as AuthUser);
      } catch {
        if (!cancelled) await logout();
      }
      if (!cancelled) setInitialized(true);
    };
    if (!initialized) bootstrap();
    return () => { cancelled = true; };
  }, [initialized, user, setUser, setInitialized, logout]);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const userTenantType = user.tenantType ?? 'stockist';

  if (requiredTenantType && userTenantType !== requiredTenantType) {
    const kind = (user as any).accountKind ?? 'tenant';
    return <Navigate to={defaultDashboard(kind, userTenantType)} replace />;
  }

  if (requiredRole === 'admin' && user.role !== 'admin') {
    if (deniedRedirect) {
      toast.error('You do not have permission to view this page');
      return <Navigate to={deniedRedirect} replace />;
    }
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-3 border border-red-100">
          <span className="font-bold text-lg">!</span>
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Access Denied</h3>
        <p className="text-sm text-slate-500 max-w-sm mt-1">
          You do not have the required role ({requiredRole}) to view this page.
        </p>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-3 border border-red-100">
          <span className="font-bold text-lg">!</span>
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Access Denied</h3>
        <p className="text-sm text-slate-500 max-w-sm mt-1">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
