import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useProducts } from '../../../hooks/useProducts';
import { useCreateRetailSale } from '../../../hooks/useRetailSales';
import { useCustomers } from '../../../hooks/useCustomers';
import { useDebounce } from '../../../hooks/useDebounce';
import PageHeader from '../../common/PageHeader';
import Button from '../../common/Button';
import ConfirmDialog from '../../common/ConfirmDialog';
import { formatCurrency } from '../../../lib/formatters';
import { api } from '../../../api/client';

interface CartItem {
  productId: string;
  productName: string;
  scheduleType: 'NONE' | 'H' | 'H1' | 'X' | 'NDPS' | null;
  packSize?: string | number | null;
  batchId?: string;
  batchLabel?: string;
  qty: number;
  rate: number;
  discountPercent: number;
  maxQty: number;
}

const SCHEDULED = new Set(['H', 'H1', 'X', 'NDPS']);

const PosPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [useSplitPayment, setUseSplitPayment] = useState(false);
  const [splitCash, setSplitCash] = useState('');
  const [splitSecondary, setSplitSecondary] = useState<'upi' | 'card'>('upi');
  const [amountReceived, setAmountReceived] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  // C26: Rx fields surfaced only when cart contains scheduled drugs.
  const [rxNumber, setRxNumber] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorRegNo, setDoctorRegNo] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');

  const { data: productsData } = useProducts({ search: debouncedSearch, pageSize: 50 });
  const debouncedCustomerSearch = useDebounce(customerSearch, 250);
  const { data: customersData } = useCustomers({ search: debouncedCustomerSearch, pageSize: 50 });
  const createSale = useCreateRetailSale();

  const products = productsData?.data ?? productsData ?? [];
  const productList = Array.isArray(products) ? products : [];
  const customers = customersData?.data ?? customersData ?? [];
  const customerList = Array.isArray(customers) ? customers : [];

  const lineTotal = (item: CartItem) => round2(item.qty * item.rate * (1 - (item.discountPercent || 0) / 100));
  const subtotal = cart.reduce((s, i) => s + lineTotal(i), 0);
  const totalDiscount = cart.reduce((s, i) => s + round2(i.qty * i.rate * (i.discountPercent || 0) / 100), 0);
  const change = !useSplitPayment && paymentMethod === 'cash' && amountReceived
    ? Math.max(0, Number(amountReceived) - subtotal) : 0;
  const splitSecondaryAmount = useSplitPayment
    ? Math.max(0, round2(subtotal - Number(splitCash || 0))) : 0;

  function round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  const requiresRx = useMemo(
    () => cart.some(c => c.scheduleType && SCHEDULED.has(c.scheduleType)),
    [cart],
  );

  const addToCart = async (product: any) => {
    let batchId: string | undefined;
    let batchLabel: string | undefined;
    let batchStock = 0;
    try {
      const { data: batches } = await api.get(`/products/${product.id}/batches`);
      const today = new Date().toISOString().slice(0, 10);
      const available = (Array.isArray(batches) ? batches : [])
        .filter((b: any) => {
          const qty = Number(b.qtyOnHand ?? b.qty_on_hand ?? 0);
          const expiry = String(b.expiryDate ?? b.expiry_date ?? '');
          return qty > 0 && expiry > today;
        });
      if (available.length > 0) {
        const sorted = [...available].sort((a: any, b: any) =>
          String(a.expiryDate ?? a.expiry_date).localeCompare(String(b.expiryDate ?? b.expiry_date)));
        batchId = sorted[0].id;
        batchLabel = sorted[0].batchNumber ?? sorted[0].batch_number;
        batchStock = Number(sorted[0].qtyOnHand ?? sorted[0].qty_on_hand ?? 0);
      }
    } catch {
      // Server picks FEFO when batchId omitted.
    }
    const stock = batchStock > 0
      ? batchStock
      : Number(product.currentStock ?? product.stock ?? 0);
    if (stock <= 0) {
      toast.error('Out of stock — receive goods via Inbound GRN first');
      return;
    }
    const existing = cart.find(c => c.productId === product.id && c.batchId === batchId);
    if (existing) {
      const nextQty = Math.min(existing.qty + 1, existing.maxQty);
      if (nextQty === existing.qty) {
        toast.error('Cannot exceed available stock');
        return;
      }
      setCart(cart.map(c => (c.productId === product.id && c.batchId === batchId) ? { ...c, qty: nextQty } : c));
    } else {
      setCart([...cart, {
        productId: product.id,
        productName: product.name,
        scheduleType: (product.scheduleType ?? 'NONE') as CartItem['scheduleType'],
        packSize: product.packSize,
        batchId,
        batchLabel,
        qty: 1,
        rate: Number(product.saleRate ?? product.mrp ?? 0),
        discountPercent: 0,
        maxQty: stock,
      }]);
    }
    setSearch('');
  };

  // M23: surface server stock-out errors clearly.
  const completeSale = async () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return; }
    if (!useSplitPayment && paymentMethod === 'cash' && Number(amountReceived || 0) < subtotal) {
      toast.error('Amount received must cover total');
      return;
    }
    if (useSplitPayment) {
      const cash = Number(splitCash || 0);
      if (cash < 0 || cash > subtotal) {
        toast.error('Cash portion must be between 0 and total');
        return;
      }
      if (round2(cash + splitSecondaryAmount) < subtotal - 0.01) {
        toast.error('Split amounts must cover the full total');
        return;
      }
    }
    if (requiresRx) {
      const missing: string[] = [];
      if (!rxNumber.trim()) missing.push('Rx number');
      if (!doctorName.trim()) missing.push('doctor name');
      if (!patientName.trim()) missing.push('patient name');
      if (missing.length > 0) {
        toast.error(`Schedule H/H1 sale needs: ${missing.join(', ')}`);
        return;
      }
    }
    try {
      const payload: Record<string, unknown> = {
        saleDate: new Date().toISOString().slice(0, 10),
        paymentMethod: useSplitPayment ? splitSecondary : paymentMethod,
        amountReceived: useSplitPayment ? subtotal : (paymentMethod === 'cash' ? Number(amountReceived) : subtotal),
        customerId: customerId || undefined,
        rxNumber: requiresRx ? rxNumber.trim() : undefined,
        doctorName: requiresRx ? doctorName.trim() : undefined,
        doctorRegNo: requiresRx ? doctorRegNo.trim() || undefined : undefined,
        patientName: requiresRx ? patientName.trim() : undefined,
        patientAge: requiresRx && patientAge ? Number(patientAge) : undefined,
        items: cart.map(c => ({
          productId: c.productId,
          batchId: c.batchId,
          qty: c.qty,
          rate: c.rate,
          discountPercent: c.discountPercent || 0,
        })),
      };
      if (useSplitPayment) {
        const cash = round2(Number(splitCash || 0));
        const secondary = round2(subtotal - cash);
        payload.paymentBreakdown = [
          ...(cash > 0 ? [{ method: 'cash', amount: cash }] : []),
          ...(secondary > 0 ? [{ method: splitSecondary, amount: secondary }] : []),
        ];
      }
      const result = await createSale.mutateAsync(payload as any);
      toast.success('Sale completed');
      setCart([]); setAmountReceived(''); setCustomerId('');
      setRxNumber(''); setDoctorName(''); setDoctorRegNo(''); setPatientName(''); setPatientAge('');
      // M27: take cashier straight to the printable receipt.
      const newId = (result as any)?.id ?? (result as any)?.sale?.id;
      if (newId) navigate(`/pharmacy/sales/${newId}?print=1`);
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.code === 'INSUFFICIENT_STOCK') {
        toast.error(data?.error ?? 'Insufficient stock', { duration: 4000 });
      } else if (data?.code === 'RX_REQUIRED') {
        toast.error(data.error);
      } else if (data?.code === 'EXPIRED_BATCH' || data?.code === 'BATCH_NOT_AVAILABLE') {
        toast.error(data.error);
      } else {
        toast.error(data?.error ?? 'Sale failed');
      }
    }
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-20 lg:pb-0">
      <PageHeader breadcrumbs={[{ label: 'POS / New Sale' }]} showBack={false} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 p-4 space-y-3">
          <input
            type="text"
            placeholder="Search products (Enter to add exact match)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // M71: exact name match on Enter (barcode scanners typically send <digits>Enter).
              if (e.key === 'Enter' && search.trim()) {
                const term = search.trim().toLowerCase();
                const match = productList.find((p: any) =>
                  (p.name ?? '').toLowerCase() === term
                  || (p.hsnCode ?? '').toLowerCase() === term,
                ) ?? (productList.length === 1 ? productList[0] : null);
                if (match) addToCart(match);
              }
            }}
            className="w-full h-11 px-3 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-teal-500"
          />
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50">
            {productList.length === 0 ? (
              search.trim() ? (
                <div className="py-8 px-4 text-center text-sm text-slate-500 space-y-2">
                  <p>No in-stock products match your search.</p>
                  <p>
                    Receive goods via{' '}
                    <Link to="/pharmacy/grn" className="text-teal-600 hover:underline font-medium">Inbound GRN</Link>
                    {' '}or add opening stock on{' '}
                    <Link to="/pharmacy/products" className="text-teal-600 hover:underline font-medium">Products</Link>.
                  </p>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">No products found</p>
              )
            ) : productList.map((p: any) => {
              const stock = Number(p.currentStock ?? p.stock ?? 0);
              const isScheduled = p.scheduleType && SCHEDULED.has(p.scheduleType);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCart(p)}
                  disabled={stock <= 0}
                  className="w-full text-left px-2 py-2.5 hover:bg-slate-50 flex justify-between items-center disabled:opacity-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                      {isScheduled && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold uppercase">
                          Rx · {p.scheduleType}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {p.genericName ? `${p.genericName} · ` : ''}{p.packSize ? `Pack ${p.packSize} · ` : ''}Stock: {stock}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-teal-600">{formatCurrency(p.saleRate ?? p.mrp)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-4 flex flex-col">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Cart</h3>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50 min-h-[200px]">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">Add products to cart</p>
            ) : cart.map((item, idx) => (
              <div key={item.productId} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{item.productName}</p>
                    {item.scheduleType && SCHEDULED.has(item.scheduleType) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold uppercase">
                        Rx · {item.scheduleType}
                      </span>
                    )}
                  </div>
                  {/* M72: bigger qty controls (44px tap targets) */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setCart(cart.map((c, i) => i === idx ? { ...c, qty: Math.max(1, c.qty - 1) } : c))}
                      className="w-10 h-10 rounded border border-slate-200 text-slate-600 text-base"
                      aria-label="Decrease quantity"
                    >−</button>
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={e => {
                        const qty = Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), item.maxQty);
                        setCart(cart.map((c, i) => i === idx ? { ...c, qty } : c));
                      }}
                      className="w-14 h-10 px-2 text-sm border border-slate-200 rounded text-center"
                    />
                    <button
                      type="button"
                      onClick={() => setCart(cart.map((c, i) => i === idx ? { ...c, qty: Math.min(item.maxQty, c.qty + 1) } : c))}
                      className="w-10 h-10 rounded border border-slate-200 text-slate-600 text-base"
                      aria-label="Increase quantity"
                    >+</button>
                    <span className="text-xs text-slate-400">× {formatCurrency(item.rate)}</span>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      Disc %
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={item.discountPercent || ''}
                        onChange={e => {
                          const discountPercent = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                          setCart(cart.map((c, i) => i === idx ? { ...c, discountPercent } : c));
                        }}
                        className="w-12 h-8 px-1 text-center border border-slate-200 rounded text-xs"
                      />
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold whitespace-nowrap">{formatCurrency(lineTotal(item))}</span>
                  <button
                    type="button"
                    onClick={() => setCart(cart.filter((_, i) => i !== idx))}
                    className="w-10 h-10 rounded text-red-500 hover:bg-red-50 text-lg leading-none"
                    aria-label={`Remove ${item.productName}`}
                  >×</button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-4 mt-4 space-y-3">
            <div>
              <label className="text-xs text-slate-500">Customer (optional)</label>
              <input
                type="text"
                placeholder="Search by name or phone…"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg mt-1"
              />
              <select
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg mt-1"
              >
                <option value="">Walk-in customer</option>
                {customerList.map((c: { id: string; name: string; phone?: string }) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.phone ? ` · ${c.phone}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-xs text-emerald-600">
                <span>Discount applied</span>
                <span>−{formatCurrency(totalDiscount)}</span>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={useSplitPayment}
                onChange={e => setUseSplitPayment(e.target.checked)}
                className="rounded border-slate-300"
              />
              Split payment (cash + UPI/card)
            </label>

            {!useSplitPayment && (
            <div className="flex gap-2">
              {(['cash', 'upi', 'card'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  aria-pressed={paymentMethod === m}
                  aria-label={`Select ${m.toUpperCase()} payment method`}
                  className={`flex-1 py-3 text-sm font-medium rounded-lg border capitalize ${
                    paymentMethod === m ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            )}

            {useSplitPayment && (
              <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <label className="text-xs text-slate-500">Cash amount</label>
                  <input
                    type="number"
                    min={0}
                    max={subtotal}
                    value={splitCash}
                    onChange={e => setSplitCash(e.target.value)}
                    className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Remainder via</label>
                  <select
                    value={splitSecondary}
                    onChange={e => setSplitSecondary(e.target.value as 'upi' | 'card')}
                    className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1"
                  >
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                  </select>
                </div>
                <p className="text-xs text-slate-600">
                  {splitSecondary.toUpperCase()}: {formatCurrency(splitSecondaryAmount)} · Total: {formatCurrency(subtotal)}
                </p>
              </div>
            )}

            {!useSplitPayment && paymentMethod === 'cash' && (
              <div>
                <label className="text-xs text-slate-500">Amount Received</label>
                <input
                  type="number"
                  value={amountReceived}
                  onChange={e => setAmountReceived(e.target.value)}
                  className="w-full h-10 px-3 text-sm border border-slate-200 rounded-lg mt-1"
                />
                {change > 0 && <p className="text-xs text-slate-500 mt-1">Change: {formatCurrency(change)}</p>}
              </div>
            )}

            {requiresRx && (
              <div className="border border-rose-200 bg-rose-50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-rose-700">
                  Prescription required for Schedule H/H1/X/NDPS items
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Rx number *"
                    value={rxNumber}
                    onChange={e => setRxNumber(e.target.value)}
                    className="h-10 px-3 text-sm border border-rose-200 rounded-lg bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Doctor name *"
                    value={doctorName}
                    onChange={e => setDoctorName(e.target.value)}
                    className="h-10 px-3 text-sm border border-rose-200 rounded-lg bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Doctor reg #"
                    value={doctorRegNo}
                    onChange={e => setDoctorRegNo(e.target.value)}
                    className="h-10 px-3 text-sm border border-rose-200 rounded-lg bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Patient name *"
                    value={patientName}
                    onChange={e => setPatientName(e.target.value)}
                    className="h-10 px-3 text-sm border border-rose-200 rounded-lg bg-white"
                  />
                  <input
                    type="number"
                    placeholder="Patient age"
                    value={patientAge}
                    onChange={e => setPatientAge(e.target.value)}
                    className="h-10 px-3 text-sm border border-rose-200 rounded-lg bg-white"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2 pb-2">
              <Button variant="secondary" onClick={() => setShowClearConfirm(true)} disabled={cart.length === 0}>Clear</Button>
              <Button
                variant="primary"
                accent="teal"
                className="flex-1"
                onClick={completeSale}
                isLoading={createSale.isPending}
                disabled={cart.length === 0}
              >
                Complete Sale — {formatCurrency(subtotal)}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => { setCart([]); setShowClearConfirm(false); }}
        title="Clear cart?"
        description="Remove all items from the current sale?"
        confirmLabel="Clear Cart"
      />
    </div>
  );
};

export default PosPage;
