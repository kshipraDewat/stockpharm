import React, { useState, useMemo } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import Button from '../common/Button';
import Input from '../common/Input';
import SlideOver from '../common/SlideOver';
import { useOrder, useCreateReturn } from '../../hooks/useOrders';
import { api } from '../../api/client';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../lib/formatters';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orderId?: string;
}

const InitiateReturnModal: React.FC<Props> = ({ isOpen, onClose, orderId }) => {
  const navigate = useNavigate();
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [batchIds, setBatchIds] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('expired');
  const [notes, setNotes] = useState('');

  const { data: order } = useOrder(orderId ?? '');
  const createReturn = useCreateReturn();

  const returnableItems = useMemo(() => (order?.items ?? []).filter((item: any) => {
    const remaining = (item.qty ?? item.quantity ?? 0) - Number(item.returnedQty ?? 0);
    return remaining > 0;
  }), [order?.items]);

  const uniqueProductIds = useMemo(() =>
    Array.from(new Set(returnableItems.map((i: any) => i.productId).filter(Boolean) as string[]))
  , [returnableItems]);

  const batchQueries = useQueries({
    queries: uniqueProductIds.map(pid => ({
      queryKey: ['products', pid, 'batches'],
      queryFn: () => api.get(`/products/${pid}/batches`).then(r => r.data),
      enabled: isOpen && !!pid,
    })),
  });

  const batchesByProductId = useMemo(() => {
    const map = new Map<string, any[]>();
    uniqueProductIds.forEach((pid, idx) => {
      const data = batchQueries[idx]?.data;
      map.set(pid, Array.isArray(data) ? data : []);
    });
    return map;
  }, [uniqueProductIds, batchQueries]);

  React.useEffect(() => {
    if (!isOpen) return;
    setReturnQtys({});
    const defaults: Record<string, string> = {};
    for (const item of returnableItems) {
      if (item.batchId) defaults[item.id] = item.batchId;
    }
    setBatchIds(defaults);
  }, [isOpen, returnableItems]);

  const handleSave = () => {
    const isRestockable = reason === 'wrong_item' || reason === 'cancelled';

    for (const item of returnableItems) {
      const orderedQty = item.qty ?? item.quantity ?? 0;
      const returnedQty = Number(item.returnedQty ?? 0);
      const remaining = orderedQty - returnedQty;
      const qty = returnQtys[item.id] ?? 0;
      if (qty > remaining) {
        toast.error(`Return qty for "${item.productName}" cannot exceed remaining qty (${remaining})`);
        return;
      }
      if (qty > 0 && isRestockable && !batchIds[item.id] && !item.batchId) {
        toast.error(`Select a batch for "${item.productName}" before returning`);
        return;
      }
    }

    const items = returnableItems
      .filter((item: any) => (returnQtys[item.id] ?? 0) > 0)
      .map((item: any) => ({
        orderItemId: item.id,
        productId: item.productId,
        batchId: batchIds[item.id] || item.batchId || undefined,
        qty: returnQtys[item.id],
        rate: Number(item.rate ?? 0),
        gstRate: Number(item.gstRate ?? 0),
      }));

    if (items.length === 0) { toast.error('Select at least one item to return'); return; }

    createReturn.mutate({
      orderId,
      returnDate: new Date().toISOString().split('T')[0],
      reason,
      notes,
      items,
    }, {
      onSuccess: (data: any) => {
        toast.success(`Return ${data.returnNumber} submitted — process from Returns to post credit note`);
        onClose();
        navigate(`/returns/${data.id}`);
      },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to create return'),
    });
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Initiate Return"
      subtitle={order?.orderNumber}
      width="xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            className="bg-red-600 hover:bg-red-700 text-white"
            leftIcon={<RotateCcw className="w-4 h-4" />}
            onClick={handleSave}
            isLoading={createReturn.isPending}
          >
            Create Credit Note
          </Button>
        </>
      )}
    >
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start text-sm text-red-800">
          <AlertTriangle className="w-5 h-5 mr-2 shrink-0 mt-0.5" />
          <p>
            Select items and quantities to return. For &quot;wrong item&quot; or &quot;cancelled&quot; reasons,
            pick the batch to restock. Processed returns post a credit note.
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[560px]">
            <thead className="bg-white border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-slate-500 font-medium">Product</th>
                <th className="px-3 py-2 text-slate-500 font-medium">Batch</th>
                <th className="px-3 py-2 text-slate-500 font-medium text-center">Rate</th>
                <th className="px-3 py-2 text-slate-500 font-medium text-center">Qty</th>
                <th className="px-3 py-2 text-slate-500 font-medium text-center">Return Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {returnableItems.map((item: any) => {
                const orderedQty = item.qty ?? item.quantity ?? 0;
                const returnedQty = Number(item.returnedQty ?? 0);
                const remaining = orderedQty - returnedQty;
                const batches = batchesByProductId.get(item.productId) ?? [];
                return (
                  <tr key={item.id}>
                    <td className="px-3 py-3 font-medium text-slate-900">
                      {item.productName}
                      {item.batchNumber && <span className="text-xs text-slate-400 block">Shipped: {item.batchNumber}</span>}
                      {returnedQty > 0 && <span className="text-xs text-amber-600 block">{returnedQty} already returned</span>}
                    </td>
                    <td className="px-3 py-3 w-44">
                      <select
                        value={batchIds[item.id] ?? ''}
                        onChange={e => setBatchIds(prev => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
                      >
                        <option value="">Auto / not required</option>
                        {batches.map((b: any) => (
                          <option key={b.id} value={b.id}>
                            {b.batchNumber} · Exp {b.expiryDate} · on hand {b.qtyOnHand}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-center text-xs">{formatCurrency(item.rate)}</td>
                    <td className="px-3 py-3 text-center">{remaining}<span className="text-xs text-slate-400 block">of {orderedQty}</span></td>
                    <td className="px-3 py-3 w-24">
                      <input
                        type="number"
                        className="w-full text-center px-1 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="0"
                        max={remaining}
                        min="0"
                        value={returnQtys[item.id] ?? ''}
                        onChange={e => setReturnQtys(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                      />
                    </td>
                  </tr>
                );
              })}
              {returnableItems.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                  {(order?.items ?? []).length === 0 ? 'Loading items…' : 'All items fully returned'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Reason for Return</label>
          <select
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            value={reason}
            onChange={e => setReason(e.target.value)}
          >
            <option value="expired">Expired / Near Expiry</option>
            <option value="damaged">Damaged Goods</option>
            <option value="wrong_item">Wrong Item Supplied</option>
            <option value="cancelled">Order Cancelled</option>
            <option value="other">Other</option>
          </select>
        </div>
        <Input label="Additional Notes" placeholder="Any specific details…" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
    </SlideOver>
  );
};

export default InitiateReturnModal;
