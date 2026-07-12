import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import { usePharmacyConnections, usePharmacyConnectionCatalog, usePharmacyConnection, useSyncStockistCatalog } from '../../../hooks/usePharmacyConnections';
import { useCreatePurchaseOrder, useSubmitPurchaseOrder, usePurchaseOrder, useUpdatePurchaseOrder } from '../../../hooks/usePurchaseOrders';
import { usePayableBills } from '../../../hooks/usePayableBills';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import { formatCurrency } from '../../../lib/formatters';
import { getConnectionStockistName } from '../../../lib/fields';

interface LineItem {
  stockistProductId: string;
  productName: string;
  qty: number;
  rate: number;
  gstRate: number;
  catalogItemId?: string;
}

const CreatePurchaseOrderPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preConnectionId = searchParams.get('connectionId') ?? '';
  const duplicateFrom = searchParams.get('duplicateFrom') ?? '';
  const editFrom = searchParams.get('editFrom') ?? '';
  const sourceId = editFrom || duplicateFrom;

  const { data: sourcePo } = usePurchaseOrder(sourceId);

  const { data: connectionsData } = usePharmacyConnections({ pageSize: 500 });
  const connections = connectionsData?.data ?? [];
  const activeConnections = connections.filter((c: { status?: string }) => c.status === 'active');

  const [connectionId, setConnectionId] = useState(preConnectionId);
  const [step, setStep] = useState<1 | 2>(preConnectionId ? 2 : 1);
  const [items, setItems] = useState<LineItem[]>([]);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');

  const { data: connectionDetail } = usePharmacyConnection(connectionId || undefined);
  const { data: catalog = [], isLoading: catalogLoading, refetch: refetchCatalog } = usePharmacyConnectionCatalog(connectionId);
  const syncCatalog = useSyncStockistCatalog();
  const { data: billsData } = usePayableBills({ stockistConnectionId: connectionId || undefined, pageSize: 500 });
  const createPo = useCreatePurchaseOrder();
  const updatePo = useUpdatePurchaseOrder();
  const submitPo = useSubmitPurchaseOrder();
  const isEditing = Boolean(editFrom);

  useEffect(() => {
    if (!sourcePo || !sourceId) return;
    if (sourcePo.stockistConnectionId) setConnectionId(sourcePo.stockistConnectionId);
    if (sourcePo.notes) setNotes(sourcePo.notes);
    setItems((sourcePo.items ?? [])
      .filter((item: any) => item.stockistProductId)
      .map((item: any) => ({
        stockistProductId: item.stockistProductId,
        catalogItemId: item.catalogItemId,
        productName: item.productName,
        qty: item.qty,
        rate: Number(item.rate ?? 0),
        gstRate: Number(item.gstRate ?? 0),
      })));
    if (sourcePo.stockistConnectionId) setStep(2);
  }, [sourcePo, sourceId]);

  useEffect(() => {
    if (step !== 2 || !connectionId || catalogLoading || syncCatalog.isPending) return;
    if (catalog.length === 0) {
      syncCatalog.mutate(connectionId, { onSuccess: () => refetchCatalog() });
    }
  }, [step, connectionId, catalog.length, catalogLoading]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (catalog as any[]).filter((p) => {
      const label = (p.name ?? p.productName ?? '').toLowerCase();
      const generic = (p.genericName ?? '').toLowerCase();
      return !q || label.includes(q) || generic.includes(q);
    });
    return list.slice(0, 50);
  }, [catalog, search]);

  const selectedConnection = activeConnections.find((c: { id: string }) => c.id === connectionId)
    ?? (connectionDetail ? { ...connectionDetail, id: connectionId } : undefined);
  const selectedStockistName =
    getConnectionStockistName(connectionDetail)
    || getConnectionStockistName(selectedConnection)
    || (connectionId ? 'Connected stockist' : '');
  const creditLimit = Number(selectedConnection?.creditLimit ?? 0);
  const lineTotal = (item: LineItem) => item.qty * item.rate;
  const grandTotal = items.reduce((s, i) => s + lineTotal(i), 0);
  const outstanding = useMemo(() => {
    return (billsData?.data ?? []).reduce((s: number, b: { outstanding?: number | string; total?: number | string; paidAmount?: number | string }) => {
      const out = b.outstanding ?? (Number(b.total ?? 0) - Number(b.paidAmount ?? 0));
      return s + Math.max(0, Number(out));
    }, 0);
  }, [billsData]);
  const projectedExposure = outstanding + grandTotal;
  const exceedsCreditLimit = creditLimit > 0 && projectedExposure > creditLimit;
  const creditHeadroom = creditLimit - outstanding;

  const addItem = (product: any) => {
    const stockistProductId = product.stockistProductId ?? product.id;
    const catalogItemId = product.stockistProductId ? product.id : undefined;
    const existing = items.find(i =>
      i.stockistProductId === stockistProductId || (catalogItemId && i.catalogItemId === catalogItemId),
    );
    if (existing) {
      setItems(items.map(i =>
        i.stockistProductId === existing.stockistProductId ? { ...i, qty: i.qty + 1 } : i,
      ));
      return;
    }
    setItems([...items, {
      stockistProductId,
      catalogItemId,
      productName: product.name ?? product.productName ?? 'Product',
      qty: 1,
      rate: Number(product.saleRate ?? product.rate ?? 0),
      gstRate: Number(product.gstRate ?? 0),
    }]);
  };

  const save = async (submit: boolean) => {
    if (!connectionId) { toast.error('Select a stockist'); return; }
    if (items.length === 0) { toast.error('Add at least one item'); return; }
    if (submit && exceedsCreditLimit) {
      toast.error(`Order exceeds credit limit. Outstanding ${formatCurrency(outstanding)} + order ${formatCurrency(grandTotal)} exceeds limit ${formatCurrency(creditLimit)}`);
      return;
    }
    try {
      const today = new Date().toISOString().split('T')[0];
      const payload = {
        stockistConnectionId: connectionId,
        orderDate: today,
        notes: notes || undefined,
        items: items.map(i => ({
          stockistProductId: i.stockistProductId,
          catalogItemId: i.catalogItemId,
          productName: i.productName,
          qty: i.qty,
          rate: i.rate,
          gstRate: i.gstRate,
        })),
      };
      const po = isEditing
        ? await updatePo.mutateAsync({ id: editFrom, ...payload })
        : await createPo.mutateAsync(payload);
      if (submit) {
        await submitPo.mutateAsync(po.id);
        toast.success('Order submitted to stockist');
      } else {
        toast.success(isEditing ? 'Draft updated' : 'Draft saved');
      }
      navigate(`/pharmacy/purchase-orders/${po.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to create order');
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <PageHeader breadcrumbs={[{ label: 'Purchase Orders', link: '/pharmacy/purchase-orders' }, { label: isEditing ? 'Edit Draft' : duplicateFrom ? 'Duplicate Order' : 'Create' }]} />

      <div className="flex gap-2">
        {([1, 2] as const).map(s => (
          <div key={s} className={`flex-1 text-center py-2 rounded-lg text-xs font-medium ${
            step >= s ? 'bg-teal-50 text-teal-700' : 'bg-slate-50 text-slate-400'
          }`}>{s === 1 ? '1. Select Stockist' : '2. Add Items'}</div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-4">
        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Stockist *</label>
              {activeConnections.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                  No active stockist connections. Connect via Discover Stockists first.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {activeConnections.map((c: any) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setConnectionId(c.id)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                        connectionId === c.id
                          ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-200'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <p className="font-semibold text-slate-900">{getConnectionStockistName(c)}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {[c.stockistGstin, c.stockistPhone].filter(Boolean).join(' · ') || 'Active connection'}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="primary" disabled={!connectionId} onClick={() => setStep(2)} className="!bg-teal-600 hover:!bg-teal-700">Next</Button>
            </div>
          </div>
        ) : (
          <>
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Ordering from</p>
            <p className="text-base font-semibold text-slate-900">{selectedStockistName}</p>
            {connectionDetail?.stockistGstin && (
              <p className="text-xs text-slate-500 mt-0.5">GSTIN {connectionDetail.stockistGstin}</p>
            )}
          </div>
          <button type="button" onClick={() => setStep(1)} className="text-xs text-teal-600 hover:underline shrink-0">
            Change stockist
          </button>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-700">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Instructions for stockist..."
            className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 resize-none"
          />
        </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Add from catalog</label>
            <input
              type="text"
              placeholder="Search products by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-900"
            />
            <div className="border border-slate-100 rounded-lg max-h-52 overflow-y-auto bg-white">
              {catalogLoading || syncCatalog.isPending ? (
                <p className="px-3 py-6 text-sm text-slate-400 text-center">Loading stockist catalog…</p>
              ) : filteredCatalog.length === 0 ? (
                <p className="px-3 py-6 text-sm text-slate-400 text-center">
                  {search.trim() ? `No products match "${search.trim()}"` : 'No products in this stockist catalog yet'}
                </p>
              ) : (
                filteredCatalog.map((p: any) => (
                  <button
                    key={p.id ?? p.stockistProductId}
                    type="button"
                    onClick={() => addItem(p)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-teal-50 border-b border-slate-50 last:border-0 flex justify-between gap-2 items-center"
                  >
                    <span className="text-slate-800 font-medium">{p.name ?? p.productName}</span>
                    <span className="text-slate-500 shrink-0">{formatCurrency(Number(p.saleRate ?? p.rate ?? 0))}</span>
                  </button>
                ))
              )}
            </div>
            {!catalogLoading && filteredCatalog.length > 0 && (
              <p className="text-xs text-slate-400">{filteredCatalog.length} product{filteredCatalog.length !== 1 ? 's' : ''} shown — click to add</p>
            )}
          </div>

        <div className="border border-slate-100 rounded-lg overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-3 py-2 text-left text-xs text-slate-400">Product</th>
                <th className="px-3 py-2 text-right text-xs text-slate-400 w-24">Qty</th>
                <th className="px-3 py-2 text-right text-xs text-slate-400 w-28">Rate</th>
                <th className="px-3 py-2 text-right text-xs text-slate-400 w-28">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400 text-sm">Search and add products from stockist catalog</td></tr>
              ) : items.map((item, idx) => (
                <tr key={item.stockistProductId}>
                  <td className="px-3 py-2">{item.productName}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={e => {
                        const qty = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setItems(items.map((it, i) => i === idx ? { ...it, qty } : it));
                      }}
                      className="w-full h-8 px-2 text-sm border border-slate-200 rounded text-right"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">{formatCurrency(item.rate)}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(lineTotal(item))}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))} className="text-red-500 text-xs">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {connectionId && creditLimit > 0 && (
          <div className={`rounded-lg px-3 py-2 text-xs ${exceedsCreditLimit ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-slate-50 border border-slate-200 text-slate-700'}`}>
            <div className="flex items-start gap-2">
              {exceedsCreditLimit && <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
              <div className="flex-1">
                <p className="font-semibold">Credit utilisation with {selectedStockistName}</p>
                <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${exceedsCreditLimit ? 'bg-red-500' : 'bg-teal-500'}`}
                    style={{ width: `${Math.min(100, creditLimit > 0 ? (projectedExposure / creditLimit) * 100 : 0)}%` }}
                  />
                </div>
                <p className="mt-1.5">Outstanding {formatCurrency(outstanding)} / Limit {formatCurrency(creditLimit)}</p>
                <p className="mt-0.5">This order {formatCurrency(grandTotal)} → {formatCurrency(projectedExposure)} total exposure</p>
                {!exceedsCreditLimit && (
                  <p className="mt-0.5 text-green-700">Headroom {formatCurrency(Math.max(0, creditHeadroom - grandTotal))}</p>
                )}
                {exceedsCreditLimit && (
                  <p className="mt-1 font-semibold">Exceeds credit limit — reduce order before submitting</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-2">
          <span className="text-sm font-semibold">Grand Total: {formatCurrency(grandTotal)}</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => save(false)} isLoading={createPo.isPending || updatePo.isPending}>
              {isEditing ? 'Update Draft' : 'Save Draft'}
            </Button>
            <Button
              variant="primary"
              onClick={() => save(true)}
              disabled={exceedsCreditLimit}
              isLoading={createPo.isPending || updatePo.isPending || submitPo.isPending}
              className="!bg-teal-600 hover:!bg-teal-700"
            >
              Submit Order
            </Button>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
};

export default CreatePurchaseOrderPage;
