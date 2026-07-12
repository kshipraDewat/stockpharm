import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

/** SPA redirect on 401 — avoids window.location hard reload aborting in-flight navigations. */
export default function SessionExpiredRedirect() {
  const navigate = useNavigate();
  const pendingAuthRedirect = useAuthStore((s) => s.pendingAuthRedirect);
  const clearAuthRedirect = useAuthStore((s) => s.clearAuthRedirect);

  useEffect(() => {
    if (!pendingAuthRedirect) return;
    const path = pendingAuthRedirect;
    clearAuthRedirect();
    navigate(path, { replace: true });
  }, [pendingAuthRedirect, clearAuthRedirect, navigate]);

  return null;
}
