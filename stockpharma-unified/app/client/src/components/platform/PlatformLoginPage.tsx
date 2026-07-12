import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import Button from '../common/Button';

export default function PlatformLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post('/platform/login', { email, password });
      setUser({ ...r.data.user, accountKind: 'platform', tenantType: 'platform' });
      toast.success('Welcome, Platform Admin');
      navigate('/platform/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">Platform Admin</h1>
        <p className="text-sm text-slate-500 mt-1">Digital Swasthya operations console</p>
        <div className="mt-6 space-y-4">
          <input type="email" required placeholder="Email" className="w-full px-3 py-2 border rounded-lg" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" required placeholder="Password" className="w-full px-3 py-2 border rounded-lg" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" variant="primary" className="w-full" isLoading={loading}>Sign In</Button>
        </div>
      </form>
    </div>
  );
}
