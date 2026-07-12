import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

export default function ConsumerPharmaciesPage() {
  const { data: pharmacies = [], isLoading } = useQuery({
    queryKey: ['consumer-pharmacies'],
    queryFn: async () => (await api.get('/accounts/consumer/pharmacies')).data,
  });

  if (isLoading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pharmacies Near You</h1>
      <div className="grid gap-3">
        {pharmacies.map((p: any) => (
          <Link key={p.id} to={`/shop/pharmacies/${p.id}`} className="block p-4 bg-white rounded-xl border hover:border-violet-300">
            <h2 className="font-semibold">{p.name}</h2>
            <p className="text-sm text-slate-500">{p.city ?? '—'} · State {p.stateCode}</p>
          </Link>
        ))}
        {pharmacies.length === 0 && <p className="text-slate-500">No listed pharmacies yet.</p>}
      </div>
    </div>
  );
}
