import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import Button from '../common/Button';

export default function MrRegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', brand: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post('/accounts/mr/register', form);
      setUser({ ...r.data.user, accountKind: 'mr', tenantType: 'mr' });
      navigate('/mr/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50 p-6">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl p-8 shadow-lg space-y-3">
        <h1 className="text-2xl font-bold">MR Registration</h1>
        {(['name', 'email', 'brand', 'phone', 'password'] as const).map((f) => (
          <input key={f} type={f === 'password' ? 'password' : f === 'email' ? 'email' : 'text'} required={f !== 'phone'}
            className="w-full border rounded-lg px-3 py-2" placeholder={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
        ))}
        <Button type="submit" variant="primary" className="w-full" isLoading={loading}>Register</Button>
        <p className="text-sm text-center"><Link to="/mr/login" className="text-amber-700">Sign in</Link></p>
      </form>
    </div>
  );
}
