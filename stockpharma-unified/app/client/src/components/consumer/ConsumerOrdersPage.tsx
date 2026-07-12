import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { formatCurrency, formatDate } from '../../lib/formatters';

export default function ConsumerOrdersPage() {
  const { data: orders = [] } = useQuery({
    queryKey: ['consumer-orders'],
    queryFn: async () => (await api.get('/accounts/consumer/orders')).data,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My Orders</h1>
      {orders.map((o: any) => (
        <div key={o.id} className="p-4 bg-white rounded-xl border">
          <div className="flex justify-between">
            <span className="font-semibold">{o.orderNumber}</span>
            <span className="text-sm capitalize">{o.status}</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{formatCurrency(o.total)} · {formatDate(o.createdAt)}</p>
        </div>
      ))}
      {orders.length === 0 && <p className="text-slate-500">No orders yet.</p>}
    </div>
  );
}
