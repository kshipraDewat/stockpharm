import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import Button from '../common/Button';

export default function ConsumerRegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post('/accounts/consumer/register', form);
      setUser({ ...r.data.user, accountKind: 'consumer', tenantType: 'consumer' });
      toast.success('Account created');
      navigate('/shop/dashboard');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-violet-50 p-6">
      <form onSubmit={submit} className="w-full max-w-md bg-white rounded-2xl p-8 shadow-lg space-y-3">
        <h1 className="text-2xl font-bold">Create Customer Account</h1>
        {(['name', 'email', 'phone', 'password'] as const).map((f) => (
          <input key={f} type={f === 'password' ? 'password' : f === 'email' ? 'email' : 'text'} required={f !== 'phone'}
            className="w-full border rounded-lg px-3 py-2" placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
            value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
        ))}
        <Button type="submit" variant="primary" className="w-full" isLoading={loading}>Register</Button>
        <p className="text-sm text-center"><Link to="/shop/login" className="text-violet-600">Already have an account?</Link></p>
      </form>
    </div>
  );
}
