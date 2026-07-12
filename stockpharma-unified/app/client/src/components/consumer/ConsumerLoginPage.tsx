import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import Button from '../common/Button';

export default function ConsumerLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post('/accounts/consumer/login', { email, password });
      setUser({ ...r.data.user, accountKind: 'consumer', tenantType: 'consumer' });
      navigate('/shop/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-violet-50 p-6">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl p-8 shadow-lg">
        <h1 className="text-2xl font-bold">Customer Login</h1>
        <p className="text-sm text-slate-500 mt-1">Order medicines &amp; book consultations</p>
        <div className="mt-6 space-y-3">
          <input type="email" required className="w-full border rounded-lg px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <input type="password" required className="w-full border rounded-lg px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
          <Button type="submit" variant="primary" className="w-full" isLoading={loading}>Sign In</Button>
        </div>
        <p className="text-sm mt-4 text-center"><Link to="/shop/register" className="text-violet-600">Create account</Link></p>
      </form>
    </div>
  );
}
