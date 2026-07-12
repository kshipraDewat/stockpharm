import React from 'react';
import { Plus, Trash2, Save, Printer, Package, ShoppingCart, AlertTriangle, ClipboardList } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePharmacies, usePharmacyCreditInfo } from '../../hooks/usePharmacies';
import { useProducts } from '../../hooks/useProducts';
import { useCreateOrder, useFinalizeOrder, useOrder } from '../../hooks/useOrders';
import { useTenant } from '../../hooks/useSettings';
import Button from '../common/Button';
import PageHeader from '../common/PageHeader';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../lib/formatters';
import { computeGst } from '../../lib/gstClient';

interface Line {
  lineId: string;
  productId: string;
  productName: string;
  qty: number;
  rate: number;
  gstRate: number;
  amount: number;
}

type PaymentMode = 'credit' | 'cash';

interface OrderDraft {
  pharmacyId: string;
  orderDate: string;
  paymentMode: PaymentMode;
  notes: string;
  lines: Line[];
}

const DRAFT_KEY = 'stockist:createOrderDraft';

const CreateOrderPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const duplicateFrom = searchParams.get('duplicateFrom');
  const { data: sourceOrder } = useOrder(duplicateFrom ?? '');
  const [lines, setLines] = React.useState<Line[]>([]);
  const [selectedPharmacy, setSelectedPharmacy] = React.useState('');
  const [orderDate, setOrderDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = React.useState<PaymentMode>('credit');
  const [notes, setNotes] = React.useState('');
  const [draftRestored, setDraftRestored] = React.useState(false);
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pasteText, setPasteText] = React.useState('');

  const { data: pharmaciesData } = usePharmacies({ pageSize: 500 });
  const { data: creditInfo, isLoading: creditInfoLoading } = usePharmacyCreditInfo(selectedPharmacy);
  const { data: productsData } = useProducts({ pageSize: 500 });
  const { data: tenant } = useTenant();
  const createOrder = useCreateOrder();
  const finalizeOrder = useFinalizeOrder();

  const pharmacies = (pharmaciesData?.data ?? pharmaciesData ?? []).filter((p: any) => p.status === 'active');
  const products = (productsData?.data ?? productsData ?? []).filter((p: any) => p.isActive !== false);

  React.useEffect(() => {
    if (draftRestored) return;
    if (duplicateFrom && sourceOrder) {
      if (sourceOrder.pharmacyId) setSelectedPharmacy(sourceOrder.pharmacyId);
      if (sourceOrder.paymentMode) setPaymentMode(sourceOrder.paymentMode as PaymentMode);
      if (sourceOrder.notes) setNotes(sourceOrder.notes);
      const mapped = (sourceOrder.items ?? []).map((it: any) => ({
        lineId: crypto.randomUUID(),
        productId: it.productId,
        productName: it.productName ?? it.name,
        qty: Number(it.qty ?? 1),
        rate: Number(it.rate ?? it.unitPrice ?? 0),
        gstRate: Number(it.gstRate ?? 12),
        amount: Number(it.qty ?? 1) * Number(it.rate ?? it.unitPrice ?? 0),
      }));
      if (mapped.length) setLines(mapped);
      setDraftRestored(true);
      return;
    }
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) { setDraftRestored(true); return; }
      const draft = JSON.parse(raw) as OrderDraft;
      if (draft.pharmacyId) setSelectedPharmacy(draft.pharmacyId);
      if (draft.orderDate) setOrderDate(draft.orderDate);
      if (draft.paymentMode) setPaymentMode(draft.paymentMode);
      if (draft.notes) setNotes(draft.notes);
      if (Array.isArray(draft.lines) && draft.lines.length > 0) setLines(draft.lines);
    } catch { /* ignore corrupt draft */ }
    setDraftRestored(true);
  }, [draftRestored, duplicateFrom, sourceOrder]);

  React.useEffect(() => {
    if (!draftRestored) return;
    const draft: OrderDraft = { pharmacyId: selectedPharmacy, orderDate, paymentMode, notes, lines };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draftRestored, selectedPharmacy, orderDate, paymentMode, notes, lines]);

  const getProductStock = (p: any) => Number(p?.currentStock ?? p?.stock ?? 0);
  const selectedPharmacyRow = pharmacies.find((p: any) => p.id === selectedPharmacy) as any;
  const sellerState = tenant?.stateCode ?? '08';
  const buyerState = selectedPharmacyRow?.stateCode ?? sellerState;

  const gstLines = lines.map(l => ({ gstRate: l.gstRate, lineSubtotal: l.amount }));
  const gst = computeGst(gstLines, sellerState, buyerState);
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const grandTotal = subtotal + gst.totalTax;

  const creditLimit = Number(creditInfo?.creditLimit ?? selectedPharmacyRow?.creditLimit ?? 0);
  const creditUsed = Number(creditInfo?.creditUsed ?? 0);
  const creditAvailable = Number(creditInfo?.creditAvailable ?? Math.max(0, creditLimit - creditUsed));
  const projectedExposure = creditUsed + grandTotal;
  const exceedsCreditLimit = paymentMode === 'credit' && creditLimit > 0 && !creditInfoLoading && projectedExposure > creditLimit;
  const creditHeadroomAfterOrder = creditAvailable - grandTotal;

  const addLine = () => {
    setLines(prev => [...prev, {
      lineId: crypto.randomUUID(),
      productId: '',
      productName: '',
      qty: 1,
      rate: 0,
      gstRate: 12,
      amount: 0,
    }]);
  };

  // Fuzzy-match a pasted product name to the loaded catalogue: exact → contains → token overlap.
  const matchProduct = (name: string): any => {
    const q = name.trim().toLowerCase();
    if (!q) return null;
    const exact = products.find((p: any) => p.name.toLowerCase() === q);
    if (exact) return exact;
    const partial = products.find((p: any) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()));
    if (partial) return partial;
    const tokens = q.split(/\s+/).filter((t) => t.length > 2);
    return products.find((p: any) => tokens.some((t) => p.name.toLowerCase().includes(t))) ?? null;
  };

  // Parse a pasted WhatsApp-style order (one item per line) into order lines.
  // Handles "Paracetamol -10", "Azithral 500 x 5", "Pan 40 20N", "Crocin - 2 strips".
  const handleParsePaste = () => {
    const rawLines = pasteText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (rawLines.length === 0) { toast.error('Paste an order first'); return; }
    const added: Line[] = [];
    const unmatched: string[] = [];
    for (const raw of rawLines) {
      const m = raw.match(/^(.*?)[\s,:\-–—]*(?:x\s*)?(\d+)\s*(?:n|nos|tabs?|strips?|boxes?|pcs?|units?)?\.?$/i);
      const name = (m ? m[1] : raw).trim();
      const qty = m ? Math.max(1, parseInt(m[2], 10)) : 1;
      const p = matchProduct(name);
      if (!p) { unmatched.push(raw); continue; }
      const rate = Number(p.saleRate ?? p.ptr ?? 0);
      added.push({
        lineId: crypto.randomUUID(),
        productId: p.id,
        productName: p.name,
        qty,
        rate,
        gstRate: Number(p.gstRate ?? 12),
        amount: qty * rate,
      });
    }
    if (added.length > 0) setLines((prev) => [...prev, ...added]);
    if (added.length > 0 && unmatched.length > 0) {
      toast.success(`Added ${added.length} item(s). Not matched: ${unmatched.join(', ')}`);
    } else if (added.length > 0) {
      toast.success(`Added ${added.length} item(s)`);
      setPasteOpen(false);
    } else {
      toast.error('No products matched — check the names against your catalogue.');
    }
    setPasteText('');
  };

  const handleProductChange = (lineId: string, productId: string) => {
    const p = products.find((x: any) => x.id === productId) as any;
    if (!p) return;
    setLines(prev => prev.map(l => l.lineId !== lineId ? l : {
      ...l, productId, productName: p.name,
      rate: Number(p.saleRate ?? p.ptr ?? 0),
      gstRate: Number(p.gstRate ?? 12),
      amount: l.qty * Number(p.saleRate ?? p.ptr ?? 0),
    }));
  };

  const updateLine = (lineId: string, field: 'qty' | 'rate', val: number) => {
    setLines(prev => prev.map(l => {
      if (l.lineId !== lineId) return l;
      if (field === 'qty') {
        const product = products.find((p: any) => p.id === l.productId) as any;
        const maxStock = getProductStock(product);
        if (maxStock > 0 && val > maxStock) { toast.error(`Only ${maxStock} units of "${l.productName}" in stock`); return l; }
      }
      const u = { ...l, [field]: val };
      u.amount = u.qty * u.rate;
      return u;
    }));
  };

  const removeLine = (lineId: string) => setLines(prev => prev.filter(l => l.lineId !== lineId));

  const validateOrder = () => {
    if (!selectedPharmacy) { toast.error('Please select a pharmacy'); return false; }
    if (lines.length === 0) { toast.error('Add at least one item'); return false; }
    if (lines.some(l => !l.productId)) { toast.error('Select a product for every line'); return false; }
    if (paymentMode === 'credit' && selectedPharmacy && creditInfoLoading) {
      toast.error('Loading credit exposure — please wait');
      return false;
    }
    if (exceedsCreditLimit) {
      toast.error(`Order exceeds credit limit. Current exposure ${formatCurrency(creditUsed)} + order ${formatCurrency(grandTotal)} exceeds limit ${formatCurrency(creditLimit)}`);
      return false;
    }
    return true;
  };

  const orderPayload = () => ({
    pharmacyId: selectedPharmacy,
    orderDate,
    paymentMode,
    notes: notes.trim() || undefined,
    items: lines.map(l => ({ productId: l.productId, qty: l.qty, freeQty: 0 })),
  });

  const handleSavePending = () => {
    if (!validateOrder()) return;
    createOrder.mutate(orderPayload(), {
      onSuccess: (data: any) => {
        sessionStorage.removeItem(DRAFT_KEY);
        toast.success('Order saved as pending');
        navigate(`/orders/${data.id}`);
      },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to create order'),
    });
  };

  const handleCreateAndPack = () => {
    if (!validateOrder()) return;
    createOrder.mutate(orderPayload(), {
      onSuccess: async (data: any) => {
        try {
          await finalizeOrder.mutateAsync(data.id);
          sessionStorage.removeItem(DRAFT_KEY);
          toast.success('Order created and packed!');
          navigate(`/orders/${data.id}`);
        } catch (err: any) {
          toast.error(err?.response?.data?.error ?? 'Order created but packing failed');
          navigate(`/orders/${data.id}`);
        }
      },
      onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to create order'),
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader title="New Sales Order"
        breadcrumbs={[{ label: 'Orders', link: '/orders' }, { label: 'Create' }]}
        actions={
          <div className="flex space-x-2">
            <Button variant="secondary" leftIcon={<Printer size={18} />} onClick={() => window.print()}>Draft Print</Button>
            <Button variant="secondary" leftIcon={<Save size={18} />} onClick={handleSavePending}
              isLoading={createOrder.isPending && !finalizeOrder.isPending}
              disabled={exceedsCreditLimit || creditInfoLoading || finalizeOrder.isPending}>Save as Pending</Button>
            <Button variant="primary" leftIcon={<Package size={18} />} onClick={handleCreateAndPack}
              isLoading={createOrder.isPending || finalizeOrder.isPending}
              disabled={exceedsCreditLimit || creditInfoLoading}>Create &amp; Pack</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Order Items</span>
              <div className="flex space-x-2">
                <Button size="sm" variant="secondary" leftIcon={<ClipboardList size={16} />} onClick={() => setPasteOpen(o => !o)}>Paste Order</Button>
                <Button size="sm" variant="secondary" leftIcon={<Plus size={16} />} onClick={addLine}>Add Medicine</Button>
              </div>
            </div>

            {pasteOpen && (
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 block">Paste WhatsApp order — one item per line</label>
                <textarea
                  rows={4}
                  autoFocus
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                  placeholder={"Paracetamol -10\nAzithral 500 x 5\nPan 40 20"}
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[11px] text-slate-400">Matched to your product catalogue by name; quantities like “-10”, “x5”, “20N” are recognised.</p>
                  <div className="flex space-x-2">
                    <Button size="sm" variant="ghost" onClick={() => { setPasteText(''); setPasteOpen(false); }}>Cancel</Button>
                    <Button size="sm" variant="primary" onClick={handleParsePaste}>Parse &amp; Add</Button>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-3 px-2 text-[10px] font-bold text-slate-400 uppercase">Product</th>
                    <th className="py-3 px-2 text-[10px] font-bold text-slate-400 uppercase text-center w-20">Qty</th>
                    <th className="py-3 px-2 text-[10px] font-bold text-slate-400 uppercase text-right">Rate</th>
                    <th className="py-3 px-2 text-[10px] font-bold text-slate-400 uppercase text-right">GST%</th>
                    <th className="py-3 px-2 text-[10px] font-bold text-slate-400 uppercase text-right">Amount</th>
                    <th className="py-3 px-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <div className="flex flex-col items-center">
                          <Package className="w-12 h-12 text-slate-200 mb-2" />
                          <p className="text-slate-400 text-sm">No items added yet.</p>
                          <Button variant="ghost" size="sm" className="mt-2 text-blue-600" onClick={addLine}>Click to add first item</Button>
                        </div>
                      </td>
                    </tr>
                  ) : lines.map(line => (
                    <tr key={line.lineId} className="hover:bg-slate-50/50">
                      <td className="py-3 px-2">
                        <select className="w-full py-1.5 px-2 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                          value={line.productId} onChange={e => handleProductChange(line.lineId, e.target.value)}>
                          <option value="" disabled>Select product…</option>
                          {products.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name} (Stock: {getProductStock(p)})</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-2">
                        <input type="number" min="1" max={getProductStock(products.find((p: any) => p.id === line.productId)) || undefined}
                          className="w-full text-center py-1.5 text-sm border border-slate-200 rounded outline-none"
                          value={line.qty} onChange={e => updateLine(line.lineId, 'qty', Number(e.target.value))} />
                        <p className="text-[10px] text-slate-400 text-center mt-0.5">
                          Available: {getProductStock(products.find((p: any) => p.id === line.productId))}
                        </p>
                      </td>
                      <td className="py-3 px-2">
                        <input type="number" className="w-full text-right py-1.5 text-sm border border-slate-200 rounded outline-none"
                          value={line.rate} onChange={e => updateLine(line.lineId, 'rate', Number(e.target.value))} />
                      </td>
                      <td className="py-3 px-2 text-right text-xs text-slate-500">{line.gstRate}%</td>
                      <td className="py-3 px-2 text-right"><span className="text-sm font-bold text-slate-900">{formatCurrency(line.amount)}</span></td>
                      <td className="py-3 px-2 text-right">
                        <button onClick={() => removeLine(line.lineId)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Order Details</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Select Pharmacy</label>
                <select className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedPharmacy} onChange={e => setSelectedPharmacy(e.target.value)}>
                  <option value="">Choose a pharmacy…</option>
                  {pharmacies.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {selectedPharmacyRow && paymentMode === 'credit' && (
                <div className={`rounded-lg px-3 py-2 text-xs ${exceedsCreditLimit ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-slate-50 border border-slate-200 text-slate-700'}`}>
                  <div className="flex items-start gap-2">
                    {exceedsCreditLimit && <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                    <div>
                      <p className="font-semibold">Credit utilisation</p>
                      {creditInfoLoading ? (
                        <p className="mt-0.5 text-slate-500">Loading exposure…</p>
                      ) : (
                        <>
                          <p className="mt-0.5">Current exposure {formatCurrency(creditUsed)} / Limit {formatCurrency(creditLimit)}</p>
                          <p className="mt-0.5">This order {formatCurrency(grandTotal)} → {formatCurrency(projectedExposure)} total exposure</p>
                          {!exceedsCreditLimit && creditLimit > 0 && (
                            <p className="mt-0.5 text-green-700">Headroom {formatCurrency(Math.max(0, creditHeadroomAfterOrder))}</p>
                          )}
                          {exceedsCreditLimit && (
                            <p className="mt-1 font-semibold">Exceeds credit limit — switch to Cash or reduce order</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Order Date</label>
                <input type="date" className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md outline-none"
                  value={orderDate} onChange={e => setOrderDate(e.target.value)} />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Payment Mode</label>
                <select className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500"
                  value={paymentMode} onChange={e => setPaymentMode(e.target.value as PaymentMode)}>
                  <option value="credit">Credit</option>
                  <option value="cash">Cash</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Notes</label>
                <textarea rows={3} placeholder="Delivery instructions, PO reference…"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </div>

              <div className="pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
                {gst.isInterstate ? (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>IGST</span>
                    <span className="font-medium">{formatCurrency(gst.igst)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-sm text-green-600">
                      <span>CGST</span>
                      <span className="font-medium">{formatCurrency(gst.cgst)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-600">
                      <span>SGST</span>
                      <span className="font-medium">{formatCurrency(gst.sgst)}</span>
                    </div>
                  </>
                )}
                {selectedPharmacy && (
                  <p className="text-[10px] text-slate-400">
                    {gst.isInterstate ? 'Interstate' : 'Intrastate'} supply ({sellerState} → {buyerState})
                  </p>
                )}
                <div className="pt-4 border-t border-slate-200 flex justify-between">
                  <span className="text-base font-bold text-slate-900">Grand Total</span>
                  <span className="text-xl font-bold text-blue-600">{formatCurrency(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-start space-x-3">
            <ShoppingCart className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-blue-900">Quick Checkout</h4>
              <p className="text-xs text-blue-700 mt-1">Save as Pending to create without reserving stock, or Create &amp; Pack to finalize immediately.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateOrderPage;
