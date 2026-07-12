import React, { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import { defaultDashboard, detectPanelFromPath, forgotPasswordPath, registerPath } from '../../lib/panel';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const panel = detectPanelFromPath(location.pathname, location.search);
  const setUser = useAuthStore((s) => s.setUser);
  const setInitialized = useAuthStore((s) => s.setInitialized);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // App brand lockup, panel-aware (matches the sidebar: blue = Stockist, teal = Pharmacy).
  const isPharmacyPanel = panel === 'pharmacy';
  const brandBg = isPharmacyPanel ? 'bg-teal-600' : 'bg-blue-600';
  const brandWord = isPharmacyPanel ? 'Pharmacy' : 'Stockist';

  const performLogin = useCallback(async (loginEmail: string, loginPassword: string) => {
    if (!loginEmail || !loginPassword) { toast.error('Fill in all fields'); return; }
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/login', {
        email: loginEmail,
        password: loginPassword,
        ...(panel === 'pharmacy' ? { tenantType: 'pharmacy' as const } : {}),
      });
      setUser(data.user);
      setInitialized(true);
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
      const dash = defaultDashboard(data.user?.tenantType ?? 'stockist');
      navigate(from && !from.includes('/login') ? from : dash, { replace: true });
    } catch (err: any) {
      if (!err?.response) {
        toast.error('Cannot reach server. Is the API running on port 4000?');
      } else if (err.response.status === 429) {
        toast.error('Too many attempts. Please try again later.');
      } else if (err.response.status === 401) {
        toast.error(err.response.data?.error ?? 'Invalid credentials');
      } else if (err.response.status >= 502) {
        toast.error('Cannot reach server. Is the API running on port 4000?');
      } else {
        toast.error(err.response.data?.error ?? 'Login failed');
      }
    } finally {
      setIsLoading(false);
    }
  }, [location.state, navigate, panel, setUser, setInitialized]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(email, password);
  };

  const inputBase = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-slate-500 placeholder:text-slate-400 transition-all';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* App brand lockup — matches the sidebar (accent rounded-lg logo + panel wordmark). */}
          <div className="inline-flex items-center gap-2 mb-4">
            <div className={`w-9 h-9 rounded-lg ${brandBg} flex items-center justify-center`}>
              <span className="text-white font-bold text-base">{brandWord[0]}</span>
            </div>
            <span className="text-lg font-bold text-slate-800">{brandWord}</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Sign in to your account</h1>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 block">Email</label>
              <input
                type="text"
                inputMode="email"
                autoComplete="username"
                required
                className={inputBase}
                placeholder="you@business.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700 block">Password</label>
                <button
                  type="button"
                  onClick={() => navigate(forgotPasswordPath(panel))}
                  className="text-xs text-slate-600 hover:text-slate-800 font-medium"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className={`${inputBase} pr-10`}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:pointer-events-none mt-2"
            >
              {isLoading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              Sign in
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          New business?{' '}
          <button onClick={() => navigate(registerPath(panel))} className="text-slate-700 hover:text-slate-900 font-medium">
            Create account
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
