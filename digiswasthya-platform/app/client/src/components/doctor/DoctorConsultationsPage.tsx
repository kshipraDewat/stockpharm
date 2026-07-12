import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/formatters';

export default function DoctorConsultationsPage() {
  const { data: rows = [] } = useQuery({
    queryKey: ['doctor-consultations'],
    queryFn: async () => (await api.get('/accounts/doctor/consultations')).data,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Consultations</h1>
      {rows.map((c: any) => (
        <div key={c.id} className="p-4 bg-white rounded-xl border">
          <div className="flex justify-between">
            <span className="font-medium capitalize">{c.mode} consult</span>
            <span className="text-sm capitalize">{c.status}</span>
          </div>
          <p className="text-sm text-slate-500">{formatCurrency(c.fee)} · {c.scheduledAt ? formatDate(c.scheduledAt) : '—'}</p>
        </div>
      ))}
      {rows.length === 0 && <p className="text-slate-500">No consultations scheduled.</p>}
    </div>
  );
}
