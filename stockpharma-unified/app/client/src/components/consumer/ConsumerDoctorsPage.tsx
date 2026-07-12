import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import Button from '../common/Button';
import { formatCurrency } from '../../lib/formatters';

export default function ConsumerDoctorsPage() {
  const { data: doctors = [] } = useQuery({
    queryKey: ['consumer-doctors'],
    queryFn: async () => (await api.get('/accounts/consumer/doctors')).data,
  });

  const book = useMutation({
    mutationFn: (doctorId: string) => api.post('/accounts/consumer/consultations', { doctorId, mode: 'video' }),
    onSuccess: () => toast.success('Consultation booked'),
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Booking failed'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Find a Doctor</h1>
      {doctors.map((d: any) => (
        <div key={d.id} className="p-4 bg-white rounded-xl border flex justify-between items-center">
          <div>
            <p className="font-semibold">{d.name}</p>
            <p className="text-sm text-slate-500">{d.specialization ?? 'General'} · Video {formatCurrency(d.consultationFeeVideo)}</p>
          </div>
          <Button size="sm" onClick={() => book.mutate(d.id)} isLoading={book.isPending}>Book</Button>
        </div>
      ))}
      {doctors.length === 0 && <p className="text-slate-500">No approved doctors yet.</p>}
    </div>
  );
}
