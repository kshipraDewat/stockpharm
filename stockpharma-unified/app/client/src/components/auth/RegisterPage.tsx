import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, UserPlus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import { validateEmail, validatePhone, validateStateCode, validatePassword, passwordStrength, normalizePhone } from '../../lib/validation';
import { defaultDashboard, loginPath } from '../../lib/panel';
import type { TenantType } from '../../lib/panel';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);
  const setInitialized = useAuthStore((s) => s.setInitialized);
  const initialPanel = searchParams.get('panel') === 'pharmacy' ? 'pharmacy' : 'stockist';
  const [tenantType, setTenantType] = useState<TenantType>(initialPanel);
  const isPharmacy = tenantType === 'pharmacy';

  const [businessName, setBusinessName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const pwStrength = passwordStrength(password);
  const accent = isPharmacy ? 'teal' : 'blue';
  const signInPath = loginPath(tenantType);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: string[] = [];
    if (!businessName || !name || !email || !phone || !stateCode || !password) {
      errors.push('Please fill in all required fields');
    }
    if (isPharmacy && !dlNumber.trim()) {
      errors.push('Drug License (DL) is required for pharmacy registration');
    }
    const emailErr = validateEmail(email);
    if (emailErr) errors.push(emailErr);
    const phoneErr = validatePhone(phone);
    if (phoneErr) errors.push(phoneErr);
    const stateErr = validateStateCode(stateCode);
    if (stateErr) errors.push(stateErr);
    const pwErr = validatePassword(password);
    if (pwErr) errors.push(pwErr);
    if (password !== confirmPassword) {
      errors.push('Passwords do not match');
    }
    if (errors.length > 0) {
      errors.forEach((msg, idx) => setTimeout(() => toast.error(msg), idx * 120));
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/register', {
        businessName, name, email, phone: normalizePhone(phone), stateCode, password,
        tenantType,
        ...(isPharmacy ? { dlNumber: dlNumber.trim() } : {}),
      });
      const me = await api.get('/auth/me');
      setUser(me.data);
      setInitialized(true);
      toast.success(`Account created! Welcome to ${isPharmacy ? 'Pharmacy' : 'Stockist'}.`);
      navigate(defaultDashboard(me.data?.tenantType ?? tenantType), { replace: true });
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const ringClass = accent === 'teal' ? 'focus:ring-teal-500 focus:border-teal-500' : 'focus:ring-blue-500 focus:border-blue-500';
  const btnClass = accent === 'teal' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-blue-600 hover:bg-blue-700';
  const linkClass = accent === 'teal' ? 'text-teal-600 hover:text-teal-700' : 'text-blue-600 hover:text-blue-700';
  const brandBg = accent === 'teal' ? 'bg-teal-600' : 'bg-blue-600';
  const brandLetter = (businessName.trim().charAt(0) || (isPharmacy ? 'P' : 'S')).toUpperCase();
  const inputBase = `w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 ${ringClass} placeholder:text-slate-400 transition-all`;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* App brand lockup — matches the sidebar (accent rounded-lg logo + panel wordmark). */}
          <div className="inline-flex items-center gap-2 mb-4">
            <div className={`w-9 h-9 rounded-lg ${brandBg} flex items-center justify-center`}>
              <span className="text-white font-bold text-base">{brandLetter}</span>
            </div>
            <span className="text-lg font-bold text-slate-800">{isPharmacy ? 'Pharmacy' : 'Stockist'}</span>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
          <p className="text-sm text-slate-500 mt-1">
            Set up your {isPharmacy ? 'Pharmacy' : 'Stockist'} business
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex rounded-lg border border-slate-200 p-0.5 mb-4">
            <button
              type="button"
              onClick={() => setTenantType('stockist')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${!isPharmacy ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Stockist
            </button>
            <button
              type="button"
              onClick={() => setTenantType('pharmacy')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${isPharmacy ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Pharmacy
            </button>
          </div>
          <form className="space-y-3" onSubmit={handleRegister}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 block">
                {isPharmacy ? 'Pharmacy Name' : 'Business Name'}
              </label>
              <input
                type="text"
                className={inputBase}
                placeholder="Your business name"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 block">Your Name</label>
              <input type="text" className={inputBase} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 block">Email</label>
                <input type="text" className={inputBase} placeholder="you@business.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 block">Phone</label>
                <input type="tel" className={inputBase} placeholder="+91 9001122334" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 block">State Code</label>
              <input type="text" className={inputBase} placeholder="08" value={stateCode} onChange={e => setStateCode(e.target.value)} maxLength={2} />
            </div>

            {isPharmacy && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 block">Drug License (DL) *</label>
                <input type="text" className={inputBase} placeholder="DL-RAJ-12345" value={dlNumber} onChange={e => setDlNumber(e.target.value)} />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 block">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className={`${inputBase} pr-10`}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {password && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${pwStrength.color} transition-all`} style={{ width: `${Math.min(100, pwStrength.score * 16)}%` }} />
                  </div>
                  <span className="text-xs text-slate-500">{pwStrength.label}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 block">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirmPw ? 'text' : 'password'}
                  className={`${inputBase} pr-10`}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                  {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full h-10 ${btnClass} text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:pointer-events-none mt-2`}
            >
              {isLoading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              Create Account
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <button onClick={() => navigate(signInPath)} className={`${linkClass} font-medium`}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
