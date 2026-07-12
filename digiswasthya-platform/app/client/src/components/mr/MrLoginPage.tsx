import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import Button from '../common/Button';

export default function MrLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post('/accounts/mr/login', { email, password });
      setUser({ ...r.data.user, accountKind: 'mr', tenantType: 'mr' });
      navigate('/mr/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50 p-6">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl p-8 shadow-lg space-y-3">
        <h1 className="text-2xl font-bold">MR Login</h1>
        <input type="email" required className="w-full border rounded-lg px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" required className="w-full border rounded-lg px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" variant="primary" className="w-full" isLoading={loading}>Sign In</Button>
        <p className="text-sm text-center"><Link to="/mr/register" className="text-amber-700">Register</Link></p>
      </form>
    </div>
  );
}
