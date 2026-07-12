import React, { useEffect, useState } from 'react';
import SlideOver from '../common/SlideOver';
import Button from '../common/Button';
import { formatCurrency } from '../../lib/formatters';
import { useSetProductSaleRates } from '../../hooks/usePurchases';
import toast from 'react-hot-toast';

export type SaleRateProduct = {
  id: string;
  name: string;
  mrp: number;
  purchaseRate: number;
  saleRate?: number;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  products: SaleRateProduct[];
  onComplete?: () => void;
  purchaseId?: string;
}

const SetSaleRatesModal: React.FC<Props> = ({ isOpen, onClose, products, onComplete, purchaseId }) => {
  const [rates, setRates] = useState<Record<string, string>>({});
  const setSaleRates = useSetProductSaleRates();

  useEffect(() => {
    if (!isOpen) return;
    const initial: Record<string, string> = {};
    for (const p of products) {
      initial[p.id] = p.saleRate && p.saleRate > 0 ? String(p.saleRate) : '';
    }
    setRates(initial);
  }, [isOpen, products]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = products.map(p => ({
      productId: p.id,
      saleRate: Number(rates[p.id]),
    }));
    if (payload.some(r => !r.saleRate || r.saleRate <= 0)) {
      toast.error('Enter a sale rate for every product');
      return;
    }
    try {
      await setSaleRates.mutateAsync({ rates: payload });
      toast.success('Sale rates saved');
      onComplete?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to save sale rates');
    }
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Set sale rates"
      subtitle={purchaseId ? 'Products from this purchase need a sale rate before stock can be received.' : 'Set sale rates for new products'}
      width="lg"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Skip for now</Button>
          <Button variant="primary" type="submit" form="set-sale-rates-form" isLoading={setSaleRates.isPending}>
            Save rates
          </Button>
        </>
      }
    >
      <form id="set-sale-rates-form" onSubmit={handleSubmit} className="space-y-3">
        <p className="text-sm text-slate-600">
          These products were added from your purchase. Enter the rate you will sell each item at (PTR).
        </p>
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">Product</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">MRP</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">Purchase</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 uppercase">Sale rate (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {products.map(p => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-medium text-slate-800">{p.name}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(p.mrp)}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(p.purchaseRate)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      className="w-24 px-2 py-1 text-sm border border-slate-200 rounded-lg text-right"
                      placeholder="PTR"
                      value={rates[p.id] ?? ''}
                      onChange={e => setRates(prev => ({ ...prev, [p.id]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </form>
    </SlideOver>
  );
};

export default SetSaleRatesModal;
