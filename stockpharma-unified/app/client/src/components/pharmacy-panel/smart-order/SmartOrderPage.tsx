import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import toast from 'react-hot-toast';
import Button from '../../common/Button';
import PageHeader from '../../common/PageHeader';
import { formatCurrency } from '../../../lib/formatters';

export default function SmartOrderPage() {
  const [rawText, setRawText] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const navigate = useNavigate();

  const parseMutation = useMutation({
    mutationFn: async () => (await api.post('/smart-order/parse', { rawText })).data,
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setItems(data.items);
      toast.success(`Parsed ${data.items.length} items`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Parse failed'),
  });

  const recommendMutation = useMutation({
    mutationFn: async () => (await api.post('/smart-order/recommend', { sessionId })).data,
    onSuccess: (data) => {
      setRecommendations(data.recommendations);
      toast.success('3 strategies ready');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Recommend failed'),
  });

  const createPoFromRec = (rec: any) => {
    const byConnection = new Map<string, any[]>();
    for (const line of rec.items) {
      const arr = byConnection.get(line.connectionId) ?? [];
      arr.push(line);
      byConnection.set(line.connectionId, arr);
    }
    if (byConnection.size === 1) {
      const lines = rec.items.map((l: any) => ({
        catalogItemId: l.catalogItemId,
        productName: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
      }));
      sessionStorage.setItem('smart-order-draft', JSON.stringify({ connectionId: rec.items[0].connectionId, lines }));
      navigate('/pharmacy/purchase-orders/create?fromSmartOrder=1');
      return;
    }
    toast('Multi-stockist split: create separate POs per stockist from recommendations', { icon: 'ℹ️' });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Smart Order" breadcrumbs={[{ label: 'Purchase', link: '/pharmacy/purchase-orders' }, { label: 'Smart Order' }]} />
      <p className="text-sm text-slate-600">
        Paste a medicine list — get <strong>Best Single</strong>, <strong>Cheapest Split</strong>, and <strong>Fastest Delivery</strong> recommendations across all connected stockists (from MedOrder/MED).
      </p>
      <textarea rows={6} className="w-full border rounded-xl p-3 font-mono text-sm" placeholder="Dolo 650 x 10&#10;Azithral 500 x 5"
        value={rawText} onChange={(e) => setRawText(e.target.value)} />
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => parseMutation.mutate()} isLoading={parseMutation.isPending} disabled={!rawText.trim()}>Analyse</Button>
        <Button variant="secondary" onClick={() => recommendMutation.mutate()} isLoading={recommendMutation.isPending} disabled={!sessionId}>Get Recommendations</Button>
      </div>

      {items.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h2 className="font-semibold mb-2">Parsed items</h2>
          <ul className="text-sm space-y-1">
            {items.map((it: any, i: number) => (
              <li key={i}>{it.productName} × {it.qty} — {it.matches?.length ?? 0} catalogue match(es)</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4">
        {recommendations.map((rec: any) => (
          <div key={rec.strategy} className="bg-white rounded-xl border p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold">{rec.label}</h3>
                <p className="text-sm text-slate-500">{rec.description}</p>
                <p className="text-sm mt-2">Covers {rec.itemsCovered}/{rec.totalItems} items · {rec.stockistCount} stockist(s) · {formatCurrency(rec.totalCost)}</p>
                {rec.savingsVsSingle != null && rec.savingsVsSingle > 0 && (
                  <p className="text-sm text-green-600">Saves {formatCurrency(rec.savingsVsSingle)} vs best single</p>
                )}
              </div>
              <Button size="sm" onClick={() => createPoFromRec(rec)}>Create PO</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
