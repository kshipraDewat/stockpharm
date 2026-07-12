import React, { useState } from 'react';
import SlideOver from '../common/SlideOver';
import Button from '../common/Button';
import Input from '../common/Input';
import { useAdjustStock, useProductBatches } from '../../hooks/useProducts';
import { daysUntilExpiry, expiryTier } from '../../lib/expiry';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName?: string;
}

const REASONS = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired / Write-off' },
  { value: 'cycle_count', label: 'Cycle Count Correction' },
  { value: 'lost', label: 'Lost / Missing' },
  { value: 'other', label: 'Other' },
] as const;

const AdjustStockModal: React.FC<Props> = ({ isOpen, onClose, productId, productName }) => {
  const adjust = useAdjustStock();
  const { data: batchesData } = useProductBatches(productId);
  const batches = batchesData ?? [];

  const [batchId, setBatchId] = useState('');
  const [deltaQty, setDeltaQty] = useState('');
  // me10: force the operator to actively pick a reason instead of letting the
  // default obscure why stock is changing.
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState('');

  const selectedBatch = batches.find((b: any) => b.id === batchId);
  const currentOnHand = selectedBatch?.qtyOnHand ?? null;
  const parsedDelta = Number(deltaQty);
  const projectedOnHand = currentOnHand !== null && !isNaN(parsedDelta)
    ? currentOnHand + parsedDelta
    : null;

  React.useEffect(() => {
    if (!isOpen) {
      setBatchId('');
      setDeltaQty('');
      setReason('');
      setNotes('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchId) { toast.error('Select a batch to adjust.'); return; }
    if (!reason) { toast.error('Pick a reason for this adjustment.'); return; }
    if (deltaQty === '' || isNaN(parsedDelta) || parsedDelta === 0) {
      toast.error('Enter a non-zero signed delta (+/-).');
      return;
    }
    if (projectedOnHand !== null && projectedOnHand < 0) {
      toast.error('Adjustment would result in negative stock.');
      return;
    }
    if (parsedDelta > 0) {
      toast('Upward corrections are capped at the original received quantity. Use Purchase for new stock.', { duration: 4000 });
    }

    adjust.mutate(
      { id: productId, batchId, deltaQty: parsedDelta, reason, notes: notes || undefined },
      {
        onSuccess: () => {
          toast.success('Stock adjusted successfully.');
          onClose();
        },
        onError: (err: any) => {
          toast.error(err?.response?.data?.error ?? 'Failed to adjust stock');
        },
      }
    );
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust Batch Stock"
      subtitle={`Product: ${productName || 'Selected Item'}`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} isLoading={adjust.isPending}>
            Apply Adjustment
          </Button>
        </div>
      }
    >
      <form className="p-5 space-y-4" onSubmit={handleSubmit}>
        <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-800">
          <p className="font-semibold mb-0.5">Signed Delta Adjustment</p>
          <p>Select an existing batch and enter a signed quantity change (e.g. −5 for damage, +3 for found stock). New batches must be added via Purchase.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Batch</label>
          <select
            className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
            value={batchId}
            onChange={e => setBatchId(e.target.value)}
            required
          >
            <option value="">Select batch…</option>
            {batches.map((b: any) => {
              const days = daysUntilExpiry(b.expiryDate);
              const tier = expiryTier(b.expiryDate);
              const expired = tier === 'expired';
              return (
                <option key={b.id} value={b.id} className={expired ? 'text-red-700' : undefined}>
                  {b.batchNumber} — on hand: {b.qtyOnHand} (exp {b.expiryDate}{expired ? ' — EXPIRED' : days != null && days <= 90 ? ` — ${days}d left` : ''})
                </option>
              );
            })}
          </select>
          {batches.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">No batches found. Add stock via Purchase first.</p>
          )}
        </div>

        {currentOnHand !== null && (
          <p className="text-sm text-gray-600">
            Current on hand: <strong>{currentOnHand}</strong>
            {projectedOnHand !== null && !isNaN(parsedDelta) && parsedDelta !== 0 && (
              <span className="ml-2 text-blue-600">→ {projectedOnHand} after adjustment</span>
            )}
          </p>
        )}

        <Input
          label="Quantity Change (+/−)"
          type="number"
          placeholder="e.g. -5 or +3"
          required
          value={deltaQty}
          onChange={e => setDeltaQty(e.target.value)}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
          <select
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
            value={reason}
            onChange={e => setReason(e.target.value)}
            required
          >
            <option value="">Pick a reason…</option>
            {REASONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <Input
          label="Notes (optional)"
          placeholder="Additional details…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </form>
    </SlideOver>
  );
};

export default AdjustStockModal;
