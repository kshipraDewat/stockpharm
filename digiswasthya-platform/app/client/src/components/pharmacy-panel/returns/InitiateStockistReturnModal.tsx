import React, { useState, useEffect, useMemo } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Button from '../../common/Button';
import Input from '../../common/Input';
import Modal from '../../common/Modal';
import { useProducts } from '../../../hooks/useProducts';
import { usePharmacyConnectionCatalog } from '../../../hooks/usePharmacyConnections';
import { useCreateStockistReturn } from '../../../hooks/useStockistReturns';
import { api } from '../../../api/client';
import { useQueries } from '@tanstack/react-query';

interface LineSource {
  id: string;
  productName: string;
  qty: number;
  rate: number;
  gstRate: number;
  batchNumber?: string;
  catalogItemId?: string;
  /** When the line already carries the local productId (preferred), use it. */
  localProductId?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  stockistConnectionId: string;
  purchaseOrderId?: string;
  payableBillId?: string;
  lines: LineSource[];
}

const InitiateStockistReturnModal: React.FC<Props> = ({
  isOpen,
  onClose,
  stockistConnectionId,
  purchaseOrderId,
  payableBillId,
  lines,
}) => {
  const navigate = useNavigate();
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [batchIds, setBatchIds] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<'expired' | 'damaged' | 'wrong_item' | 'cancelled' | 'other'>('expired');
  const [notes, setNotes] = useState('');

  // me97: prefer explicit `localProductId` from the bill row; fall back to name match.
  const { data: productsData } = useProducts({ pageSize: 500 });
  const products = productsData?.data ?? productsData ?? [];
  const { data: catalogItems = [] } = usePharmacyConnectionCatalog(
    isOpen && stockistConnectionId ? stockistConnectionId : '',
  );
  const createReturn = useCreateStockistReturn();

  useEffect(() => {
    if (isOpen) {
      setReturnQtys({});
      setBatchIds({});
      setReason('expired');
      setNotes('');
    }
  }, [isOpen]);

  const productByName = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of Array.isArray(products) ? products : []) {
      map.set((p.name ?? '').toLowerCase().trim(), p);
    }
    return map;
  }, [products]);

  const productById = useMemo(() => {
    const map = new Map<string, any>();
    for (const p of Array.isArray(products) ? products : []) {
      map.set(p.id, p);
    }
    return map;
  }, [products]);

  const catalogById = useMemo(() => {
    const m = new Map<string, { localProductId?: string | null }>();
    for (const c of catalogItems as { id: string; localProductId?: string | null }[]) {
      m.set(c.id, c);
    }
    return m;
  }, [catalogItems]);

  const resolvedLines = useMemo(() => lines.map(line => {
    const catalogEntry = line.catalogItemId ? catalogById.get(line.catalogItemId) : undefined;
    const product = (line.localProductId && productById.get(line.localProductId))
      ?? (catalogEntry?.localProductId && productById.get(catalogEntry.localProductId))
      ?? productByName.get(line.productName.toLowerCase().trim());
    return { ...line, product, maxQty: line.qty };
  }), [lines, productByName, productById, catalogById]);

  // M11: per-line batch list pulled once per unique product id.
  const uniqueProductIds = useMemo(() =>
    Array.from(new Set(resolvedLines.map(l => l.product?.id).filter(Boolean) as string[]))
  , [resolvedLines]);

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

  const handleSave = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const items: any[] = [];
    for (const line of resolvedLines) {
      const qty = returnQtys[line.id] ?? 0;
      if (qty <= 0) continue;
      if (!line.product) {
        toast.error(`No local product mapped for "${line.productName}". Map it from the stockist's catalog first.`);
        return;
      }
      if (qty > line.maxQty) {
        toast.error(`Return qty for "${line.productName}" cannot exceed ${line.maxQty}`);
        return;
      }
      // For restockable reasons the server requires batchId. Either way, surface
      // a clear error here instead of letting the throw escape the .map().
      const isRestockable = reason === 'wrong_item' || reason === 'cancelled';
      if (isRestockable && !batchIds[line.id]) {
        toast.error(`Select a batch for "${line.productName}" before returning`);
        return;
      }
      const chosenBatchId = batchIds[line.id] || undefined;
      if (chosenBatchId) {
        const batch = (batchesByProductId.get(line.product.id) ?? []).find((b: any) => b.id === chosenBatchId);
        if (batch && reason === 'expired' && batch.expiryDate && batch.expiryDate > today) {
          // Soft warning — server doesn't enforce window today; warn cashier.
          // (Allow continue; this is opt-in policy.)
        }
      }
      items.push({
        productId: line.product.id,
        batchId: chosenBatchId,
        qty,
        rate: Number(line.rate),
        gstRate: Number(line.gstRate),
      });
    }

    if (items.length === 0) {
      toast.error('Select at least one item to return');
      return;
    }

    try {
      const data = await createReturn.mutateAsync({
        stockistConnectionId,
        purchaseOrderId,
        payableBillId,
        returnDate: today,
        reason,
        notes: notes || undefined,
        items,
      } as any);
      toast.success(`Return ${(data as any)?.returnNumber ?? ''} submitted to stockist`);
      onClose();
      navigate('/pharmacy/returns');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to create return');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Initiate Return to Stockist"
      subtitle="Select items, batches and quantities. The stockist will review and process."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            accent="teal"
            leftIcon={<RotateCcw className="w-4 h-4" />}
            onClick={handleSave}
            isLoading={createReturn.isPending}
          >
            Submit Return
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 flex items-start text-sm text-amber-800">
          <AlertTriangle className="w-5 h-5 mr-2 shrink-0 mt-0.5" />
          <p>For "wrong item" or "cancelled" returns, pick the batch to restock. Expired items don't need batch selection.</p>
        </div>

        <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-x-auto">
          <div className="flex justify-end px-3 pt-2">
            <button
              type="button"
              className="text-xs text-teal-600 hover:underline"
              onClick={() => {
                const filled: Record<string, number> = {};
                resolvedLines.forEach(line => {
                  if (line.product) filled[line.id] = line.maxQty;
                });
                setReturnQtys(filled);
              }}
            >
              Return all eligible items
            </button>
          </div>
          <table className="w-full text-left text-sm min-w-[560px]">
            <thead className="bg-white border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-slate-500 font-medium">Product</th>
                <th className="px-3 py-2 text-slate-500 font-medium">Batch</th>
                <th className="px-3 py-2 text-slate-500 font-medium text-center">Max</th>
                <th className="px-3 py-2 text-slate-500 font-medium text-center">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {resolvedLines.map(line => {
                const batches = line.product ? (batchesByProductId.get(line.product.id) ?? []) : [];
                return (
                  <tr key={line.id}>
                    <td className="px-3 py-3">
                      <span className="font-medium text-slate-900">{line.productName}</span>
                      {line.batchNumber && <span className="text-xs text-slate-400 block">Original batch: {line.batchNumber}</span>}
                      {!line.product && <span className="text-xs text-red-600 block">No local product match — map it first</span>}
                    </td>
                    <td className="px-3 py-3 w-44">
                      {line.product ? (
                        <select
                          value={batchIds[line.id] ?? ''}
                          onChange={e => setBatchIds(prev => ({ ...prev, [line.id]: e.target.value }))}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
                        >
                          <option value="">Auto / not required</option>
                          {batches.map((b: any) => (
                            <option key={b.id} value={b.id}>
                              {b.batchNumber} · Exp {b.expiryDate} · on hand {b.qtyOnHand}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">{line.maxQty}</td>
                    <td className="px-3 py-3 w-24">
                      <input
                        type="number"
                        className="w-full text-center px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                        placeholder="0"
                        max={line.maxQty}
                        min={0}
                        disabled={!line.product}
                        value={returnQtys[line.id] ?? ''}
                        onChange={e => setReturnQtys(prev => ({ ...prev, [line.id]: Math.max(0, Math.min(line.maxQty, Number(e.target.value))) }))}
                      />
                    </td>
                  </tr>
                );
              })}
              {resolvedLines.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">No returnable items</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
          <select
            className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-teal-500"
            value={reason}
            onChange={e => setReason(e.target.value as typeof reason)}
          >
            <option value="expired">Expired / Near Expiry</option>
            <option value="damaged">Damaged Goods</option>
            <option value="wrong_item">Wrong Item Supplied</option>
            <option value="cancelled">Order Cancelled</option>
            <option value="other">Other</option>
          </select>
          {(reason === 'wrong_item' || reason === 'cancelled') && (
            <p className="text-xs text-slate-500 mt-1">Batch selection is required so the stockist can restock the right lot.</p>
          )}
        </div>

        <Input label="Notes" placeholder="Additional details…" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
};

export default InitiateStockistReturnModal;
