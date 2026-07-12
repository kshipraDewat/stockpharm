import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import Button from '../common/Button';

export default function MrVisitsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ pharmacyName: '', phone: '', address: '', notes: '' });
  const { data: visits = [] } = useQuery({
    queryKey: ['mr-visits'],
    queryFn: async () => (await api.get('/accounts/mr/visits')).data,
  });

  const record = useMutation({
    mutationFn: () => api.post('/accounts/mr/visits', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mr-visits'] });
      setForm({ pharmacyName: '', phone: '', address: '', notes: '' });
      toast.success('Visit recorded');
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pharmacy Visits</h1>
      <form onSubmit={(e) => { e.preventDefault(); record.mutate(); }} className="p-4 bg-white rounded-xl border space-y-2">
        <input required placeholder="Pharmacy name" className="w-full border rounded px-3 py-2" value={form.pharmacyName} onChange={(e) => setForm({ ...form, pharmacyName: e.target.value })} />
        <input placeholder="Phone" className="w-full border rounded px-3 py-2" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input placeholder="Address" className="w-full border rounded px-3 py-2" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <textarea placeholder="Notes" className="w-full border rounded px-3 py-2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <Button type="submit" isLoading={record.isPending}>Record Visit</Button>
      </form>
      <div className="space-y-2">
        {visits.map((v: any) => (
          <div key={v.id} className="p-3 bg-white rounded-lg border text-sm">
            <p className="font-medium">{v.pharmacyName}</p>
            <p className="text-slate-500">{v.phone} · {v.notes}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
