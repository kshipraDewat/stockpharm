import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { KeyRound, ArrowLeft, Send } from 'lucide-react';
import { api } from '../../api/client';
import { detectPanelFromPath, loginPath } from '../../lib/panel';
import toast from 'react-hot-toast';

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const panel = detectPanelFromPath(location.pathname, location.search);
  const loginRoute = loginPath(panel);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error('Please enter your registered email'); return; }
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email, tenantType: panel });
      setIsSent(true);
      setEmailConfigured(data.emailConfigured !== false);
      if (data.devToken) setDevToken(data.devToken);
      if (data.emailConfigured === false) {
        toast('Email delivery is not configured. Contact your administrator for a password reset.', { icon: 'ℹ️' });
      } else {
        toast.success(data.message ?? 'If that email exists, a reset link has been sent.');
      }
    } catch (err: any) {
      if (err?.response?.status === 429) {
        toast.error('Too many attempts. Please try again later.');
      } else {
        toast.error(err?.response?.data?.error ?? 'Failed to send reset link. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const inputBase = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-slate-400 transition-all';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Back Link */}
        <button
          onClick={() => navigate(loginRoute)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to login
        </button>

        {/* Brand/Title */}
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-4 text-blue-600">
            <KeyRound className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Forgot Password</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isSent ? 'Check your email for a reset link' : 'Enter your email to receive a reset link'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          {!isSent ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 block">Email Address</label>
                <input
                  type="email"
                  className={inputBase}
                  placeholder="name@business.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:pointer-events-none mt-2"
              >
                {isLoading ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Send Reset Link
              </button>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <div className={`p-3 border rounded-xl text-sm ${emailConfigured ? 'bg-green-50 border-green-100 text-green-700' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
                {emailConfigured
                  ? <>If an account exists for <strong>{email}</strong>, a password reset link has been sent.</>
                  : <>Password reset email is not configured on this server. Please contact your administrator to reset your password.</>}
              </div>
              {devToken && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs text-slate-600 break-all">
                  <p className="font-medium text-slate-700 mb-1">Development reset token:</p>
                  <code>{devToken}</code>
                  <p className="mt-2 text-slate-500">Use at /reset-password with this token in dev mode.</p>
                </div>
              )}

              <button
                onClick={() => setIsSent(false)}
                className="text-xs text-slate-500 hover:text-slate-700 underline block mx-auto pt-2"
              >
                Try a different email address
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
