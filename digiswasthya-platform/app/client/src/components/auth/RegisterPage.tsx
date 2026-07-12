import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, UserPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import {
  validateEmail, validatePhone, validateStateCode, validatePassword,
  passwordStrength, normalizePhone,
} from '../../lib/validation';
import { defaultDashboard, loginPath } from '../../lib/panel';
import type { TenantType } from '../../lib/panel';

const STEPS = ['Business', 'Contact', 'Account'] as const;

const RegisterPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);
  const setInitialized = useAuthStore((s) => s.setInitialized);
  const initialPanel = searchParams.get('panel') === 'pharmacy' ? 'pharmacy' : 'stockist';
  const [tenantType, setTenantType] = useState<TenantType>(initialPanel);
  const [step, setStep] = useState(0);
  const isPharmacy = tenantType === 'pharmacy';

  const [businessName, setBusinessName] = useState('');
  const [dlNumber, setDlNumber] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const pwStrength = passwordStrength(password);
  const accent = isPharmacy ? 'teal' : 'blue';
  const signInPath = loginPath(tenantType);
  const ringClass = accent === 'teal' ? 'focus:ring-teal-500 focus:border-teal-500' : 'focus:ring-blue-500 focus:border-blue-500';
  const btnClass = accent === 'teal' ? 'bg-teal-600 hover:bg-teal-700' : 'bg-blue-600 hover:bg-blue-700';
  const inputBase = `w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 ${ringClass} placeholder:text-slate-400`;

  const validateStep = (s: number): string[] => {
    const errors: string[] = [];
    if (s === 0) {
      if (!businessName.trim()) errors.push('Business name is required');
      if (isPharmacy && !dlNumber.trim()) errors.push('Drug License (DL) is required for pharmacy');
    }
    if (s === 1) {
      if (!name.trim()) errors.push('Your name is required');
      const emailErr = validateEmail(email);
      if (emailErr) errors.push(emailErr);
      const phoneErr = validatePhone(phone);
      if (phoneErr) errors.push(phoneErr);
      const stateErr = validateStateCode(stateCode);
      if (stateErr) errors.push(stateErr);
    }
    if (s === 2) {
      const pwErr = validatePassword(password);
      if (pwErr) errors.push(pwErr);
      if (password !== confirmPassword) errors.push('Passwords do not match');
    }
    return errors;
  };

  const nextStep = () => {
    const errors = validateStep(step);
    if (errors.length) {
      errors.forEach((msg, idx) => setTimeout(() => toast.error(msg), idx * 120));
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const submitRegister = async () => {
    const allErrors = [...validateStep(0), ...validateStep(1), ...validateStep(2)];
    if (allErrors.length) {
      allErrors.forEach((msg, idx) => setTimeout(() => toast.error(msg), idx * 120));
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/auth/register', {
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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
          <p className="text-sm text-slate-500 mt-1">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
        </div>

        <div className="flex gap-2 mb-6">
          {STEPS.map((label, i) => (
            <div key={label} className={`flex-1 h-1 rounded-full ${i <= step ? (isPharmacy ? 'bg-teal-500' : 'bg-blue-500') : 'bg-slate-200'}`} title={label} />
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                {(['stockist', 'pharmacy'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTenantType(t)}
                    className={`flex-1 py-2 text-sm font-medium rounded-md capitalize transition-colors ${tenantType === t ? (t === 'pharmacy' ? 'bg-teal-600 text-white' : 'bg-blue-600 text-white') : 'text-slate-600'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">{isPharmacy ? 'Pharmacy name' : 'Business name'} *</label>
                <input className={inputBase} value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoFocus />
              </div>
              {isPharmacy && (
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1">Drug License (DL) *</label>
                  <input className={inputBase} value={dlNumber} onChange={(e) => setDlNumber(e.target.value)} placeholder="DL-XXXX-XXXX" />
                </div>
              )}
              <p className="text-xs text-slate-400">Document upload &amp; bank details — coming in a later step (per HUB spec).</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Your name *</label>
                <input className={inputBase} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Email *</label>
                <input type="email" className={inputBase} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Phone *</label>
                <input type="tel" className={inputBase} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">State code *</label>
                <input className={inputBase} value={stateCode} onChange={(e) => setStateCode(e.target.value)} placeholder="08" maxLength={2} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Password *</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} className={`${inputBase} pr-10`} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowPw(!showPw)} tabIndex={-1}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password && (
                  <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full transition-all ${pwStrength.score >= 3 ? 'bg-green-500' : pwStrength.score >= 2 ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${(pwStrength.score / 4) * 100}%` }} />
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1">Confirm password *</label>
                <div className="relative">
                  <input type={showConfirmPw ? 'text' : 'password'} className={`${inputBase} pr-10`} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setShowConfirmPw(!showConfirmPw)} tabIndex={-1}>
                    {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)} className="flex items-center gap-1 px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={nextStep} className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-sm font-medium text-white rounded-lg ${btnClass}`}>
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button type="button" disabled={isLoading} onClick={submitRegister} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${btnClass}`}>
                {isLoading ? 'Creating…' : <><UserPlus className="w-4 h-4" /> Create account</>}
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <button onClick={() => navigate(signInPath)} className="text-slate-700 font-medium hover:underline">Sign in</button>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
