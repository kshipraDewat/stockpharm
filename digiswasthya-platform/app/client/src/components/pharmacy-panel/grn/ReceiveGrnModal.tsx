import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { useCreateGrn } from '../../../hooks/useGrn';
import { useProducts, useCreateProductFromCatalog } from '../../../hooks/useProducts';
import { usePharmacyConnectionCatalog } from '../../../hooks/usePharmacyConnections';
import SlideOver from '../../common/SlideOver';
import Button from '../../common/Button';

interface GrnLine {
  lineId: string;
  purchaseOrderItemId: string;
  catalogItemId?: string;
  stockistProductId?: string;
  productId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string;
  qty: number;
  maxQty: number;
  paidPending: number;
  freePending: number;
  mrp: number;
  purchaseRate: number;
  saleRate: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: any;
  onSuccess?: () => void;
}

function pendingBreakdown(item: { qty?: number; freeQty?: number; receivedQty?: number }) {
  const ordered = Number(item.qty ?? 0);
  const free = Number(item.freeQty ?? 0);
  const received = Number(item.receivedQty ?? 0);
  const paidPending = Math.max(0, ordered - Math.min(received, ordered));
  const freePending = Math.max(0, free - Math.max(0, received - ordered));
  return { total: paidPending + freePending, paidPending, freePending };
}

const ReceiveGrnModal: React.FC<Props> = ({ isOpen, onClose, purchaseOrder, onSuccess }) => {
  const createGrn = useCreateGrn();
  const createFromCatalog = useCreateProductFromCatalog();
  const { data: productsData } = useProducts({ pageSize: 500 });
  const products = productsData?.data ?? productsData ?? [];
  const connectionId = purchaseOrder?.stockistConnectionId ?? purchaseOrder?.stockist?.id ?? '';
  const { data: catalogItems = [] } = usePharmacyConnectionCatalog(connectionId);

  const catalogById = useMemo(() => {
    const m = new Map<string, { localProductId?: string | null }>();
    for (const c of catalogItems as { id: string; localProductId?: string | null }[]) {
      m.set(c.id, c);
    }
    return m;
  }, [catalogItems]);

  const [lines, setLines] = useState<GrnLine[]>([]);
  const [notes, setNotes] = useState('');
  const idempotencyKeyRef = useRef('');

  const newIdempotencyKey = useCallback(() => {
    idempotencyKeyRef.current = crypto.randomUUID();
  }, []);

  useEffect(() => {
    if (isOpen) newIdempotencyKey();
  }, [isOpen, newIdempotencyKey]);

  const handleClose = useCallback(() => {
    newIdempotencyKey();
    onClose();
  }, [newIdempotencyKey, onClose]);

  useEffect(() => {
    if (!isOpen || !purchaseOrder?.items) return;

    const bill = purchaseOrder.linkedPayableBill;
    const billItems: any[] = bill?.items ?? [];

    const builtLines = purchaseOrder.items
        .map((item: any) => {
          const { total, paidPending, freePending } = pendingBreakdown(item);
          if (total <= 0) return null;

          const catalogEntry = item.catalogItemId ? catalogById.get(item.catalogItemId) : undefined;
          const matchedByCatalog = catalogEntry?.localProductId
            ? (Array.isArray(products) ? products : []).find((p: { id: string }) => p.id === catalogEntry.localProductId)
            : null;

          const matched = matchedByCatalog ?? (Array.isArray(products) ? products : []).find((p: { name?: string }) =>
            p.name?.toLowerCase() === item.productName?.toLowerCase(),
          );

          const billLine = bill?.externalBillId
            ? billItems.find((b: { externalProductId?: string; productName?: string }) => (
                (b.externalProductId && item.stockistProductId && b.externalProductId === item.stockistProductId)
                || b.productName?.toLowerCase() === item.productName?.toLowerCase()
              ))
            : null;

          return {
            lineId: crypto.randomUUID(),
            purchaseOrderItemId: item.id,
            catalogItemId: item.catalogItemId,
            stockistProductId: item.stockistProductId,
            productId: matched?.id ?? '',
            productName: item.productName,
            batchNumber: billLine?.batchNumber ?? '',
            expiryDate: billLine?.expiryDate ?? '',
            qty: total,
            maxQty: total,
            paidPending,
            freePending,
            mrp: Number(item.mrp ?? item.rate ?? 0),
            purchaseRate: Number(item.rate ?? 0),
            saleRate: Number(item.rate ?? 0),
          };
        })
        .filter(Boolean) as GrnLine[];

    setLines(builtLines);

    const needsCreate = builtLines.filter((l) => !l.productId && l.catalogItemId);
    if (needsCreate.length === 0) return;

    let cancelled = false;
    (async () => {
      const updates = new Map<string, string>();
      for (const line of needsCreate) {
        if (cancelled || !line.catalogItemId) continue;
        try {
          const product = await createFromCatalog.mutateAsync(line.catalogItemId);
          updates.set(line.lineId, product.id);
        } catch {
          // Individual catalog lines may fail; user can map manually or use bulk action.
        }
      }
      if (!cancelled && updates.size > 0) {
        setLines((prev) => prev.map((l) => (
          updates.has(l.lineId) ? { ...l, productId: updates.get(l.lineId)! } : l
        )));
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, purchaseOrder, products, catalogById, createFromCatalog]);

  const updateLine = (lineId: string, patch: Partial<GrnLine>) => {
    setLines(prev => prev.map(l => l.lineId === lineId ? { ...l, ...patch } : l));
  };

  const splitBatch = (lineId: string) => {
    setLines(prev => {
      const idx = prev.findIndex(l => l.lineId === lineId);
      if (idx < 0) return prev;
      const line = prev[idx];
      if (line.qty <= 1) return prev;
      const half = Math.floor(line.qty / 2);
      const remainder = line.qty - half;
      const sibling: GrnLine = {
        ...line,
        lineId: crypto.randomUUID(),
        batchNumber: '',
        expiryDate: '',
        qty: remainder,
      };
      return prev.map((l, i) => i === idx ? { ...l, qty: half } : l).concat(sibling);
    });
  };

  const handleCreateFromCatalog = async (lineId: string) => {
    const line = lines.find(l => l.lineId === lineId);
    if (!line?.catalogItemId) {
      toast.error('No catalog item linked for this line');
      return;
    }
    try {
      const product = await createFromCatalog.mutateAsync(line.catalogItemId);
      updateLine(lineId, { productId: product.id });
      toast.success(`Created local product: ${product.name}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to create product');
    }
  };

  const unmappedCatalogLines = lines.filter((l) => !l.productId && l.catalogItemId);

  const handleCreateAllFromCatalog = async () => {
    if (unmappedCatalogLines.length === 0) return;
    let created = 0;
    for (const line of unmappedCatalogLines) {
      if (!line.catalogItemId) continue;
      try {
        const product = await createFromCatalog.mutateAsync(line.catalogItemId);
        updateLine(line.lineId, { productId: product.id });
        created++;
      } catch {
        // Continue with remaining lines.
      }
    }
    if (created > 0) {
      toast.success(`Created ${created} local product${created === 1 ? '' : 's'} from catalog`);
    } else {
      toast.error('Could not create products from catalog');
    }
  };

  const maxForPoItem = (poItemId: string) =>
    lines.find(l => l.purchaseOrderItemId === poItemId)?.maxQty ?? 0;

  const sumForPoItem = (poItemId: string, excludeLineId?: string) =>
    lines.filter(l => l.purchaseOrderItemId === poItemId && l.lineId !== excludeLineId)
      .reduce((s, l) => s + l.qty, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      toast.error('No pending quantities to receive');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    for (const line of lines) {
      if (!line.productId) { toast.error(`Map product for ${line.productName}`); return; }
      if (!line.batchNumber.trim()) { toast.error('Batch number required'); return; }
      if (!line.expiryDate) { toast.error('Expiry date required'); return; }
      if (line.expiryDate < today) { toast.error('Expiry must be today or later'); return; }
      if (line.qty < 1) { toast.error(`Qty for ${line.productName} must be at least 1`); return; }
    }

    const byPoItem = new Map<string, GrnLine[]>();
    for (const l of lines) {
      const arr = byPoItem.get(l.purchaseOrderItemId) ?? [];
      arr.push(l);
      byPoItem.set(l.purchaseOrderItemId, arr);
    }
    for (const [poItemId, group] of byPoItem) {
      const total = group.reduce((s, l) => s + l.qty, 0);
      if (total > maxForPoItem(poItemId)) {
        toast.error(`Total qty for ${group[0].productName} exceeds pending (${maxForPoItem(poItemId)})`);
        return;
      }
    }

    const submitItems: {
      purchaseOrderItemId?: string;
      productId: string;
      batchNumber: string;
      expiryDate: string;
      qty: number;
      freeQty?: number;
      mrp: number;
      purchaseRate: number;
      saleRate: number;
    }[] = [];

    for (const [, group] of byPoItem) {
      let paidLeft = group[0].paidPending;
      let freeLeft = group[0].freePending;
      for (const l of group) {
        let remaining = l.qty;
        const paid = Math.min(remaining, paidLeft);
        paidLeft -= paid;
        remaining -= paid;
        const free = Math.min(remaining, freeLeft);
        freeLeft -= free;
        submitItems.push({
          purchaseOrderItemId: l.purchaseOrderItemId,
          productId: l.productId,
          batchNumber: l.batchNumber,
          expiryDate: l.expiryDate,
          qty: paid,
          freeQty: free > 0 ? free : undefined,
          mrp: l.mrp,
          purchaseRate: l.purchaseRate,
          saleRate: l.saleRate,
        });
      }
    }

    try {
      await createGrn.mutateAsync({
        body: {
          purchaseOrderId: purchaseOrder.id,
          receivedDate: today,
          notes: notes || undefined,
          items: submitItems,
        },
        idempotencyKey: idempotencyKeyRef.current,
      });
      toast.success('GRN recorded — stock updated');
      newIdempotencyKey();
      onSuccess?.();
      handleClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'GRN failed');
    }
  };

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={handleClose}
      title="Receive GRN"
      subtitle={`PO ${purchaseOrder?.poNumber ?? ''} · ${purchaseOrder?.stockist?.stockistName ?? ''}`}
      width="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {unmappedCatalogLines.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreateAllFromCatalog}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium"
              disabled={createFromCatalog.isPending}
            >
              Create all from catalog ({unmappedCatalogLines.length})
            </button>
          </div>
        )}
        {lines.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">All items on this PO have been fully received.</p>
        ) : lines.map((line) => {
          const otherSum = sumForPoItem(line.purchaseOrderItemId, line.lineId);
          const lineMax = Math.max(1, maxForPoItem(line.purchaseOrderItemId) - otherSum);
          return (
          <div key={line.lineId} className="border border-slate-100 rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-slate-800">{line.productName}</p>
                <p className="text-xs text-slate-400">
                  Pending: {line.maxQty} ({line.paidPending} paid + {line.freePending} free)
                </p>
              </div>
              {line.qty > 1 && (
                <button
                  type="button"
                  onClick={() => splitBatch(line.lineId)}
                  className="inline-flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-700 font-medium shrink-0"
                >
                  <Plus className="w-3 h-3" /> Split batch
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-500">Local Product</label>
                <select
                  value={line.productId}
                  onChange={e => updateLine(line.lineId, { productId: e.target.value })}
                  className="w-full h-8 px-2 text-xs border border-slate-200 rounded"
                  required
                >
                  <option value="">Select product</option>
                  {(Array.isArray(products) ? products : []).map((p: { id: string; name: string }) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {!line.productId && line.catalogItemId && (
                  <button
                    type="button"
                    onClick={() => handleCreateFromCatalog(line.lineId)}
                    className="mt-1 text-[10px] text-teal-600 hover:text-teal-700 font-medium"
                    disabled={createFromCatalog.isPending}
                  >
                    Create from catalog
                  </button>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500">Batch #</label>
                <input value={line.batchNumber} onChange={e => updateLine(line.lineId, { batchNumber: e.target.value })} className="w-full h-8 px-2 text-xs border border-slate-200 rounded" required />
              </div>
              <div>
                <label className="text-xs text-slate-500">Expiry</label>
                <input type="date" value={line.expiryDate} onChange={e => updateLine(line.lineId, { expiryDate: e.target.value })} className="w-full h-8 px-2 text-xs border border-slate-200 rounded" required />
              </div>
              <div>
                <label className="text-xs text-slate-500">Qty Received</label>
                <input
                  type="number"
                  min={1}
                  max={lineMax}
                  value={line.qty}
                  onChange={e => {
                    const raw = parseInt(e.target.value, 10) || 1;
                    updateLine(line.lineId, { qty: Math.min(lineMax, Math.max(1, raw)) });
                  }}
                  className="w-full h-8 px-2 text-xs border border-slate-200 rounded"
                />
              </div>
            </div>
          </div>
        );})}

        <div>
          <label className="text-sm text-slate-600">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm border border-slate-200 rounded-lg" rows={2} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" type="submit" isLoading={createGrn.isPending} disabled={lines.length === 0} className="!bg-teal-600 hover:!bg-teal-700">
            Confirm GRN
          </Button>
        </div>
      </form>
    </SlideOver>
  );
};

export default ReceiveGrnModal;
