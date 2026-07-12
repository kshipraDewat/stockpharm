import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import Button from '../common/Button';
import { formatCurrency } from '../../lib/formatters';

export default function ConsumerPharmacyShopPage() {
  const { pharmacyId } = useParams<{ pharmacyId: string }>();
  const navigate = useNavigate();
  const [cart, setCart] = useState<Record<string, { product: any; qty: number }>>({});

  const { data: products = [] } = useQuery({
    queryKey: ['consumer-products', pharmacyId],
    queryFn: async () => (await api.get(`/accounts/consumer/pharmacies/${pharmacyId}/products`)).data,
    enabled: !!pharmacyId,
  });

  const placeOrder = useMutation({
    mutationFn: async () => {
      const items = Object.values(cart).map(({ product, qty }) => ({
        productId: product.id,
        productName: product.name,
        qty,
        unitPrice: Number(product.saleRate),
        gstRate: 12,
      }));
      return api.post('/accounts/consumer/orders', {
        pharmacyTenantId: pharmacyId,
        items,
        paymentMode: 'cod',
        deliveryAddress: { line: 'To be collected', city: '—', pin: '000000' },
      });
    },
    onSuccess: () => { toast.success('Order placed!'); navigate('/shop/orders'); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Failed'),
  });

  const add = (p: any) => setCart((c) => ({ ...c, [p.id]: { product: p, qty: (c[p.id]?.qty ?? 0) + 1 } }));
  const total = Object.values(cart).reduce((s, { product, qty }) => s + qty * Number(product.saleRate), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Shop Medicines</h1>
      <div className="grid sm:grid-cols-2 gap-3">
        {products.map((p: any) => (
          <div key={p.id} className="p-4 bg-white rounded-xl border flex justify-between items-center">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-slate-500">{formatCurrency(p.saleRate)}</p>
            </div>
            <Button size="sm" onClick={() => add(p)}>Add</Button>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="sticky bottom-4 p-4 bg-violet-700 text-white rounded-xl flex justify-between items-center">
          <span>Cart: {formatCurrency(total)}</span>
          <Button variant="secondary" onClick={() => placeOrder.mutate()} isLoading={placeOrder.isPending}>Place Order (COD)</Button>
        </div>
      )}
    </div>
  );
}
